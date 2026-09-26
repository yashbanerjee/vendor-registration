import { Prisma } from "@prisma/client"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { z } from "zod"
import { audit } from "@/server/audit"
import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"
import { authorize, scopeVendor } from "@/server/guard"
import { assertSameOrg, businessScope } from "@/server/tenant"
import { clientMeta, fileResponse, listQuery, metaOf, ok, parseDate, readJson, toPlain } from "@/server/http"
import { nextCode } from "@/server/numbers"
import { notifyStaff, notifyVendorUsers } from "@/server/notify"
import { priceDocument, vatContext } from "@/server/pricing"

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().optional().nullable(),
  unitPrice: z.number().min(0),
})

async function priced(body: { items?: z.infer<typeof lineSchema>[]; discount?: number; deliveryCharges?: number }) {
  const tax = await vatContext()
  const pricedLines = priceDocument({
    items: body.items || [],
    discount: body.discount,
    delivery: body.deliveryCharges,
    vatRate: tax.rate,
  })
  if (!pricedLines) throw new ApiError(422, "Add at least one line item.")
  return { ...pricedLines, currency: tax.currency }
}

export async function listEvents(req: Request) {
  const user = await authorize({ module: "events", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const vendorId = user.portal === "VENDOR" ? user.vendorId : query.vendorId || undefined
  const where: Prisma.EventWhereInput = {
    deletedAt: null,
    ...businessScope(user),
    ...(query.status ? { status: query.status as never } : {}),
    ...(vendorId ? { vendors: { some: { vendorId } } } : {}),
    ...(query.q
      ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { code: { contains: query.q, mode: "insensitive" } }, { client: { contains: query.q, mode: "insensitive" } }] }
      : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      include: { _count: { select: { vendors: true } } },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Events loaded.", metaOf(total, query.page, query.pageSize))
}

export async function getEvent(_req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "events", action: "VIEW" })
  const event = await prisma.event.findFirst({
    where: { id: params.id, deletedAt: null, ...businessScope(user), ...(user.portal === "VENDOR" ? { vendors: { some: { vendorId: user.vendorId || "" } } } : {}) },
    include: { vendors: { include: { vendor: { select: { id: true, legalName: true, vendorCode: true, status: true } } } } },
  })
  if (!event) throw new ApiError(404, "Event not found.")
  return ok(toPlain(event), "Event loaded.")
}

const eventSchema = z.object({
  name: z.string().min(2),
  client: z.string().optional().nullable(),
  venue: z.string().optional().nullable(),
  emirate: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  eventType: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  status: z.enum(["DRAFT", "PLANNING", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
})

export async function saveEvent(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "events", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = eventSchema.parse(await readJson(req))
  const data = {
    name: body.name,
    client: body.client || null,
    venue: body.venue || null,
    emirate: body.emirate || null,
    startDate: parseDate(body.startDate),
    endDate: parseDate(body.endDate),
    eventType: body.eventType || null,
    description: body.description || null,
    status: body.status || "DRAFT",
  }
  const row = params.id
    ? await prisma.event.update({ where: { id: params.id }, data })
    : await prisma.event.create({ data: { ...data, organizationId: user.organizationId, code: await nextCode("event", "EV") } })
  await audit({ userId: user.id, action: params.id ? "Updated event" : "Created event", module: "events", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(toPlain(row), params.id ? "Event updated." : "Event created.", undefined, params.id ? 200 : 201)
}

export async function deleteEvent(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "events", action: "DELETE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const row = await prisma.event.update({ where: { id: params.id }, data: { deletedAt: new Date(), status: "CANCELLED" } })
  await audit({ userId: user.id, action: "Cancelled event", module: "events", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok({ id: row.id }, "Event archived.")
}

export async function assignEventVendor(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "events", action: "EDIT", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z.object({ vendorId: z.string(), category: z.string().optional(), service: z.string().optional(), scope: z.string().optional() }).parse(await readJson(req))
  const link = await prisma.eventVendor.upsert({
    where: { eventId_vendorId: { eventId: params.id, vendorId: body.vendorId } },
    update: { category: body.category, service: body.service, scope: body.scope },
    create: { eventId: params.id, vendorId: body.vendorId, category: body.category, service: body.service, scope: body.scope },
  })
  const vendor = await prisma.vendor.findUnique({ where: { id: body.vendorId } })
  await notifyVendorUsers(body.vendorId, "task", { title: "Event assignment", status: "assigned", vendor: vendor?.legalName || "" }, "/vendor/events")
  await audit({ userId: user.id, action: "Assigned vendor to event", module: "events", recordId: params.id, recordLabel: vendor?.legalName, ...clientMeta(req) })
  return ok(link, "Vendor assigned.", undefined, 201)
}

export async function removeEventVendor(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "events", action: "EDIT", portals: ["SUPER_ADMIN", "ADMIN"] })
  await prisma.eventVendor.delete({ where: { id: params.id } })
  await audit({ userId: user.id, action: "Removed event vendor", module: "events", recordId: params.id, ...clientMeta(req) })
  return ok({ id: params.id }, "Vendor removed from the event.")
}

export async function listRfqs(req: Request) {
  const user = await authorize({ module: "rfqs", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const vendorId = scopeVendor(user, query.vendorId)
  const where: Prisma.RfqWhereInput = {
    ...businessScope(user),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.eventId ? { eventId: query.eventId } : {}),
    ...(vendorId ? { vendors: { some: { vendorId } } } : {}),
    ...(query.q ? { OR: [{ title: { contains: query.q, mode: "insensitive" } }, { number: { contains: query.q, mode: "insensitive" } }] } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.rfq.count({ where }),
    prisma.rfq.findMany({
      where,
      include: { event: { select: { name: true, code: true } }, vendors: { include: { vendor: { select: { id: true, legalName: true } } } }, _count: { select: { quotations: true } } },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "RFQs loaded.", metaOf(total, query.page, query.pageSize))
}

export async function saveRfq(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "rfqs", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z
    .object({
      title: z.string().min(2),
      eventId: z.string().nullable().optional(),
      category: z.string().optional(),
      description: z.string().optional(),
      quantity: z.number().optional(),
      unit: z.string().optional(),
      deliveryLocation: z.string().optional(),
      requiredDate: z.string().optional(),
      deadline: z.string().optional(),
      status: z.enum(["DRAFT", "SENT", "CLOSED", "CANCELLED", "AWARDED"]).optional(),
      vendorIds: z.array(z.string()).optional(),
    })
    .parse(await readJson(req))
  const data = {
    title: body.title,
    eventId: body.eventId || null,
    category: body.category,
    description: body.description,
    quantity: body.quantity,
    unit: body.unit,
    deliveryLocation: body.deliveryLocation,
    requiredDate: parseDate(body.requiredDate),
    deadline: parseDate(body.deadline),
    status: body.status || "DRAFT",
  }
  const row = params.id
    ? await prisma.rfq.update({ where: { id: params.id }, data })
    : await prisma.rfq.create({ data: { ...data, organizationId: user.organizationId, number: await nextCode("rfq", "RFQ") } })
  if (body.vendorIds) {
    await prisma.rfqVendor.deleteMany({ where: { rfqId: row.id } })
    if (body.vendorIds.length) {
      await prisma.rfqVendor.createMany({ data: body.vendorIds.map((vendorId) => ({ rfqId: row.id, vendorId })) })
    }
    if ((body.status || row.status) === "SENT") {
      for (const vendorId of body.vendorIds) {
        await notifyVendorUsers(vendorId, "rfq", { number: row.number, title: row.title }, "/vendor/rfqs")
      }
    }
  }
  await audit({ userId: user.id, action: params.id ? "Updated RFQ" : "Created RFQ", module: "rfqs", recordId: row.id, recordLabel: row.number, ...clientMeta(req) })
  return ok(toPlain(row), "RFQ saved.", undefined, params.id ? 200 : 201)
}

export async function respondRfq(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "rfqs", action: "VIEW", portals: ["VENDOR"] })
  const body = z.object({ action: z.enum(["ACCEPT", "DECLINE"]) }).parse(await readJson(req))
  if (!user.vendorId) throw new ApiError(403, "Vendor profile missing.")
  const link = await prisma.rfqVendor.findUnique({ where: { rfqId_vendorId: { rfqId: params.id, vendorId: user.vendorId } } })
  if (!link) throw new ApiError(404, "This RFQ was not sent to your company.")
  const updated = await prisma.rfqVendor.update({
    where: { id: link.id },
    data: { status: body.action === "ACCEPT" ? "ACCEPTED" : "DECLINED" },
  })
  await audit({ userId: user.id, action: body.action === "ACCEPT" ? "Accepted RFQ" : "Declined RFQ", module: "rfqs", recordId: params.id, ...clientMeta(req) })
  return ok(updated, body.action === "ACCEPT" ? "RFQ accepted." : "RFQ declined.")
}

export async function listQuotations(req: Request) {
  const user = await authorize({ module: "quotations", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const vendorId = scopeVendor(user, query.vendorId)
  const where: Prisma.QuotationWhereInput = {
    ...businessScope(user),
    ...(vendorId ? { vendorId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(new URL(req.url).searchParams.get("rfqId") ? { rfqId: new URL(req.url).searchParams.get("rfqId") } : {}),
    ...(query.q ? { number: { contains: query.q, mode: "insensitive" } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.quotation.count({ where }),
    prisma.quotation.findMany({
      where,
      include: { vendor: { select: { id: true, legalName: true } }, rfq: { select: { number: true, title: true } }, items: true },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Quotations loaded.", metaOf(total, query.page, query.pageSize))
}

const quoteSchema = z.object({
  rfqId: z.string().nullable().optional(),
  vendorId: z.string().optional(),
  items: z.array(lineSchema).min(1),
  discount: z.number().min(0).optional(),
  deliveryCharges: z.number().min(0).optional(),
  notes: z.string().optional(),
  status: z.enum(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"]).optional(),
})

export async function saveQuotation(req: Request, params: Record<string, string>) {
  const creating = !params.id
  const user = await authorize({ module: "quotations", action: creating ? "CREATE" : "EDIT" })
  const body = quoteSchema.parse(await readJson(req))
  const vendorId = scopeVendor(user, body.vendorId) || body.vendorId
  if (!vendorId) throw new ApiError(422, "Choose a vendor.")
  if (body.rfqId && user.portal === "VENDOR") {
    const invited = await prisma.rfqVendor.findUnique({ where: { rfqId_vendorId: { rfqId: body.rfqId, vendorId } } })
    if (!invited) throw new ApiError(403, "Your company was not invited to this RFQ.")
    if (invited.status === "DECLINED") throw new ApiError(409, "This RFQ was declined.")
  }
  const money = await priced(body)
  const data = {
    rfqId: body.rfqId || null,
    vendorId,
    status: body.status || "SUBMITTED",
    subtotal: money.subtotal,
    discount: money.discount,
    vat: money.vat,
    deliveryCharges: money.delivery,
    total: money.total,
    notes: body.notes,
  }
  let row
  if (params.id) {
    const existing = await prisma.quotation.findUnique({ where: { id: params.id } })
    if (!existing) throw new ApiError(404, "Quotation not found.")
    assertSameOrg(user, existing.organizationId)
    scopeVendor(user, existing.vendorId)
    row = await prisma.quotation.update({
      where: { id: params.id },
      data: { ...data, items: { deleteMany: {}, create: money.items } },
    })
  } else {
    row = await prisma.quotation.create({
      data: { ...data, organizationId: user.organizationId, number: await nextCode("quotation", "QT"), items: { create: money.items } },
    })
  }
  if (body.rfqId) {
    await prisma.rfqVendor.updateMany({ where: { rfqId: body.rfqId, vendorId }, data: { status: "SUBMITTED" } })
  }
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
  if ((body.status || "SUBMITTED") === "SUBMITTED") {
    await notifyStaff("quotation", { number: row.number, vendor: vendor?.legalName || "", title: "Quotation" }, `/admin/quotations`)
  }
  await audit({ userId: user.id, action: creating ? "Submitted quotation" : "Updated quotation", module: "quotations", recordId: row.id, recordLabel: row.number, ...clientMeta(req) })
  return ok(toPlain(row), "Quotation saved.", undefined, creating ? 201 : 200)
}

export async function setQuotationStatus(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "quotations", action: "APPROVE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z.object({ status: z.enum(["UNDER_REVIEW", "ACCEPTED", "REJECTED"]) }).parse(await readJson(req))
  const row = await prisma.quotation.update({ where: { id: params.id }, data: { status: body.status }, include: { vendor: true, rfq: true } })
  if (body.status === "ACCEPTED" && row.rfqId) {
    await prisma.rfq.update({ where: { id: row.rfqId }, data: { status: "AWARDED" } })
  }
  await notifyVendorUsers(row.vendorId, "quotation", { number: row.number, vendor: row.vendor.legalName, title: row.rfq?.title || row.number }, "/vendor/quotations")
  await audit({ userId: user.id, action: `Quotation ${body.status.toLowerCase()}`, module: "quotations", recordId: row.id, recordLabel: row.number, ...clientMeta(req) })
  return ok(toPlain(row), "Quotation updated.")
}

export async function listPurchaseOrders(req: Request) {
  const user = await authorize({ module: "purchaseOrders", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const vendorId = scopeVendor(user, query.vendorId)
  const where: Prisma.PurchaseOrderWhereInput = {
    ...businessScope(user),
    ...(vendorId ? { vendorId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.q ? { number: { contains: query.q, mode: "insensitive" } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.findMany({
      where,
      include: { vendor: { select: { legalName: true } }, event: { select: { name: true } }, items: true, paymentTerm: true },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Purchase orders loaded.", metaOf(total, query.page, query.pageSize))
}

export async function savePurchaseOrder(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "purchaseOrders", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z
    .object({
      quotationId: z.string().optional(),
      vendorId: z.string().optional(),
      eventId: z.string().nullable().optional(),
      rfqId: z.string().nullable().optional(),
      items: z.array(lineSchema).optional(),
      discount: z.number().optional(),
      paymentTermId: z.string().nullable().optional(),
      deliveryDate: z.string().optional(),
      terms: z.string().optional(),
      status: z.enum(["DRAFT", "ISSUED", "ACKNOWLEDGED", "PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED"]).optional(),
    })
    .parse(await readJson(req))

  let vendorId = body.vendorId
  let eventId = body.eventId || null
  let rfqId = body.rfqId || null
  let items = body.items
  let discount = body.discount
  if (body.quotationId) {
    const quote = await prisma.quotation.findUnique({ where: { id: body.quotationId }, include: { items: true, rfq: true } })
    if (!quote) throw new ApiError(404, "Quotation not found.")
    vendorId = quote.vendorId
    rfqId = quote.rfqId
    eventId = quote.rfq?.eventId || eventId
    items = quote.items.map((item) => ({ description: item.description, quantity: Number(item.quantity), unit: item.unit, unitPrice: Number(item.unitPrice) }))
    discount = Number(quote.discount)
  }
  if (!vendorId || !items?.length) throw new ApiError(422, "A purchase order needs a vendor and line items.")
  const money = await priced({ items, discount, deliveryCharges: 0 })
  const data = {
    vendorId,
    eventId,
    rfqId,
    quotationId: body.quotationId || null,
    status: body.status || "DRAFT",
    subtotal: money.subtotal,
    discount: money.discount,
    vat: money.vat,
    total: money.total,
    paymentTermId: body.paymentTermId || null,
    deliveryDate: parseDate(body.deliveryDate),
    terms: body.terms,
  }
  const row = params.id
    ? await prisma.purchaseOrder.update({ where: { id: params.id }, data: { ...data, items: { deleteMany: {}, create: money.items } } })
    : await prisma.purchaseOrder.create({ data: { ...data, organizationId: user.organizationId, number: await nextCode("po", "PO"), items: { create: money.items } } })
  if (row.status === "ISSUED") {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
    await notifyVendorUsers(vendorId, "purchase_order", { number: row.number, vendor: vendor?.legalName || "" }, "/vendor/purchase-orders")
  }
  await audit({ userId: user.id, action: params.id ? "Updated purchase order" : "Created purchase order", module: "purchaseOrders", recordId: row.id, recordLabel: row.number, ...clientMeta(req) })
  return ok(toPlain(row), "Purchase order saved.", undefined, params.id ? 200 : 201)
}

export async function purchaseOrderPdf(_req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "purchaseOrders", action: "VIEW" })
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: { vendor: true, event: true, items: true, paymentTerm: true },
  })
  if (!po) throw new ApiError(404, "Purchase order not found.")
  scopeVendor(user, po.vendorId)
  const company = await prisma.companySetting.findUnique({ where: { id: "default" } })
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const color = rgb(0.1, 0.3, 0.29)
  page.drawText(company?.companyName || "Purchase order", { x: 48, y: 790, size: 18, font: bold, color })
  page.drawText(po.number, { x: 420, y: 790, size: 14, font: bold })
  const lines = [
    `Vendor: ${po.vendor.legalName}`,
    po.vendor.trn ? `TRN: ${po.vendor.trn}` : "",
    po.event ? `Event: ${po.event.name}` : "",
    po.paymentTerm ? `Payment terms: ${po.paymentTerm.name}` : "",
    po.deliveryDate ? `Delivery: ${po.deliveryDate.toISOString().slice(0, 10)}` : "",
  ].filter(Boolean)
  lines.forEach((line, index) => page.drawText(line, { x: 48, y: 750 - index * 18, size: 11, font }))
  let y = 640
  page.drawText("Description", { x: 48, y, size: 10, font: bold })
  page.drawText("Qty", { x: 330, y, size: 10, font: bold })
  page.drawText("Price", { x: 390, y, size: 10, font: bold })
  page.drawText("Total", { x: 480, y, size: 10, font: bold })
  y -= 18
  for (const item of po.items) {
    page.drawText(item.description.slice(0, 48), { x: 48, y, size: 10, font })
    page.drawText(String(item.quantity), { x: 330, y, size: 10, font })
    page.drawText(Number(item.unitPrice).toFixed(2), { x: 390, y, size: 10, font })
    page.drawText(Number(item.total).toFixed(2), { x: 480, y, size: 10, font })
    y -= 16
  }
  y -= 12
  for (const [label, value] of [
    ["Subtotal", po.subtotal],
    ["Discount", po.discount],
    ["VAT", po.vat],
    ["Total", po.total],
  ] as const) {
    page.drawText(`${label}`, { x: 390, y, size: 11, font: label === "Total" ? bold : font })
    page.drawText(Number(value).toFixed(2), { x: 480, y, size: 11, font: label === "Total" ? bold : font })
    y -= 16
  }
  if (po.terms) page.drawText(po.terms.slice(0, 420), { x: 48, y: Math.max(80, y - 20), size: 9, font })
  const bytes = await pdf.save()
  return fileResponse(Buffer.from(bytes), "application/pdf", `${po.number}.pdf`)
}

export async function listContracts(req: Request) {
  const user = await authorize({ module: "contracts", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const vendorId = scopeVendor(user, query.vendorId)
  const where: Prisma.ContractWhereInput = {
    ...businessScope(user),
    ...(vendorId ? { vendorId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.q ? { OR: [{ title: { contains: query.q, mode: "insensitive" } }, { number: { contains: query.q, mode: "insensitive" } }] } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      include: { vendor: { select: { legalName: true } }, event: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Contracts loaded.", metaOf(total, query.page, query.pageSize))
}

export async function saveContract(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "contracts", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z
    .object({
      title: z.string().min(2),
      type: z.enum(["NDA", "VENDOR_AGREEMENT", "SERVICE_CONTRACT", "EVENT_CONTRACT"]),
      vendorId: z.string(),
      eventId: z.string().nullable().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      renewalDate: z.string().optional(),
      value: z.number().optional(),
      status: z.enum(["DRAFT", "PENDING_SIGNATURE", "ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED", "RENEWED"]).optional(),
      fileAssetId: z.string().optional(),
      notes: z.string().optional(),
    })
    .parse(await readJson(req))
  const data = {
    title: body.title,
    type: body.type,
    vendorId: body.vendorId,
    eventId: body.eventId || null,
    startDate: parseDate(body.startDate),
    endDate: parseDate(body.endDate),
    renewalDate: parseDate(body.renewalDate),
    value: body.value,
    status: body.status || "DRAFT",
    fileAssetId: body.fileAssetId,
    notes: body.notes,
  }
  const row = params.id
    ? await prisma.contract.update({ where: { id: params.id }, data })
    : await prisma.contract.create({ data: { ...data, organizationId: user.organizationId, number: await nextCode("contract", "CT") } })
  await audit({ userId: user.id, action: params.id ? "Updated contract" : "Created contract", module: "contracts", recordId: row.id, recordLabel: row.number, ...clientMeta(req) })
  return ok(toPlain(row), "Contract saved.", undefined, params.id ? 200 : 201)
}
