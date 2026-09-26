import { Prisma } from "@prisma/client"
import { z } from "zod"
import { audit } from "@/server/audit"
import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"
import { authorize, scopeVendor } from "@/server/guard"
import { clientMeta, listQuery, metaOf, ok, parseDate, readJson, toPlain } from "@/server/http"
import { nextCode } from "@/server/numbers"
import { notifyStaff, notifyVendorUsers } from "@/server/notify"
import { priceDocument, vatContext } from "@/server/pricing"

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
})

export async function listInvoices(req: Request) {
  const user = await authorize({ module: "invoices", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const vendorId = scopeVendor(user, query.vendorId)
  const where: Prisma.InvoiceWhereInput = {
    ...(vendorId ? { vendorId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.q ? { number: { contains: query.q, mode: "insensitive" } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: { vendor: { select: { legalName: true, trn: true } }, po: { select: { number: true } }, event: { select: { name: true } }, items: true },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Invoices loaded.", metaOf(total, query.page, query.pageSize))
}

export async function saveInvoice(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "invoices", action: params.id ? "EDIT" : "CREATE" })
  const body = z
    .object({
      vendorId: z.string().optional(),
      poId: z.string().nullable().optional(),
      eventId: z.string().nullable().optional(),
      invoiceDate: z.string().optional(),
      trn: z.string().optional(),
      items: z.array(lineSchema).min(1),
      notes: z.string().optional(),
      fileAssetId: z.string().optional(),
      status: z.enum(["DRAFT", "SUBMITTED"]).optional(),
      number: z.string().optional(),
    })
    .parse(await readJson(req))
  const vendorId = scopeVendor(user, body.vendorId) || body.vendorId
  if (!vendorId) throw new ApiError(422, "Choose a vendor.")
  const tax = await vatContext()
  const money = priceDocument({ items: body.items.map((item) => ({ ...item, unit: null })), vatRate: tax.rate })
  if (!money) throw new ApiError(422, "Add at least one line item.")
  const data = {
    vendorId,
    poId: body.poId || null,
    eventId: body.eventId || null,
    invoiceDate: parseDate(body.invoiceDate) || new Date(),
    trn: body.trn,
    subtotal: money.subtotal,
    vat: money.vat,
    total: money.total,
    notes: body.notes,
    fileAssetId: body.fileAssetId,
    status: body.status || "SUBMITTED",
  }
  let row
  if (params.id) {
    const existing = await prisma.invoice.findUnique({ where: { id: params.id } })
    if (!existing) throw new ApiError(404, "Invoice not found.")
    scopeVendor(user, existing.vendorId)
    if (user.portal === "VENDOR" && !["DRAFT", "CHANGES_REQUESTED"].includes(existing.status)) {
      throw new ApiError(409, "This invoice can no longer be edited.")
    }
    row = await prisma.invoice.update({ where: { id: params.id }, data: { ...data, items: { deleteMany: {}, create: money.items.map(({ unit: _unit, ...item }) => item) } } })
  } else {
    row = await prisma.invoice.create({
      data: {
        ...data,
        number: body.number || (await nextCode("invoice", "INV")),
        items: { create: money.items.map(({ unit: _unit, ...item }) => item) },
      },
    })
  }
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
  if (row.status === "SUBMITTED") await notifyStaff("invoice", { number: row.number, vendor: vendor?.legalName || "", status: row.status }, "/admin/invoices")
  await audit({ userId: user.id, action: params.id ? "Updated invoice" : "Submitted invoice", module: "invoices", recordId: row.id, recordLabel: row.number, ...clientMeta(req) })
  return ok(toPlain(row), "Invoice saved.", undefined, params.id ? 200 : 201)
}

export async function reviewInvoice(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "invoices", action: "APPROVE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z.object({ action: z.enum(["VERIFY", "APPROVE", "REJECT", "CHANGES"]), note: z.string().optional() }).parse(await readJson(req))
  const status = body.action === "VERIFY" ? "UNDER_REVIEW" : body.action === "APPROVE" ? "APPROVED" : body.action === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED"
  const row = await prisma.invoice.update({ where: { id: params.id }, data: { status, notes: body.note }, include: { vendor: true } })
  await notifyVendorUsers(row.vendorId, "invoice", { number: row.number, vendor: row.vendor.legalName, status }, "/vendor/invoices")
  await audit({ userId: user.id, action: `Invoice ${status.toLowerCase()}`, module: "invoices", recordId: row.id, recordLabel: row.number, newValue: { note: body.note }, ...clientMeta(req) })
  return ok(toPlain(row), "Invoice updated.")
}

export async function listPayments(req: Request) {
  const user = await authorize({ module: "payments", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const vendorId = scopeVendor(user, query.vendorId)
  const where: Prisma.PaymentWhereInput = {
    ...(vendorId ? { vendorId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.q ? { reference: { contains: query.q, mode: "insensitive" } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: { vendor: { select: { legalName: true } }, invoice: { select: { number: true, total: true } }, po: { select: { number: true, total: true } } },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Payments loaded.", metaOf(total, query.page, query.pageSize))
}

export async function savePayment(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "payments", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z
    .object({
      vendorId: z.string(),
      invoiceId: z.string().nullable().optional(),
      poId: z.string().nullable().optional(),
      amount: z.number().positive(),
      advance: z.number().min(0).optional(),
      paidAmount: z.number().min(0).optional(),
      dueDate: z.string().optional(),
      status: z.enum(["PENDING", "APPROVED", "PARTIALLY_PAID", "PAID", "OVERDUE", "REJECTED"]).optional(),
      method: z.string().optional(),
      notes: z.string().optional(),
    })
    .parse(await readJson(req))
  const paid = body.paidAmount || 0
  let status = body.status || "PENDING"
  if (!body.status) {
    if (paid <= 0) status = "PENDING"
    else if (paid + (body.advance || 0) >= body.amount) status = "PAID"
    else status = "PARTIALLY_PAID"
  }
  const data = {
    vendorId: body.vendorId,
    invoiceId: body.invoiceId || null,
    poId: body.poId || null,
    amount: body.amount,
    advance: body.advance || 0,
    paidAmount: paid,
    dueDate: parseDate(body.dueDate),
    status,
    method: body.method,
    notes: body.notes,
    paidAt: status === "PAID" ? new Date() : null,
  }
  const row = params.id
    ? await prisma.payment.update({ where: { id: params.id }, data })
    : await prisma.payment.create({ data: { ...data, reference: await nextCode("payment", "PAY") } })
  if (row.invoiceId && (status === "PAID" || status === "PARTIALLY_PAID")) {
    await prisma.invoice.update({ where: { id: row.invoiceId }, data: { status: status === "PAID" ? "PAID" : "PARTIALLY_PAID" } })
  }
  const vendor = await prisma.vendor.findUnique({ where: { id: body.vendorId } })
  await notifyVendorUsers(body.vendorId, "payment", { number: row.reference, vendor: vendor?.legalName || "", status }, "/vendor/payments")
  await audit({ userId: user.id, action: "Saved payment", module: "payments", recordId: row.id, recordLabel: row.reference, ...clientMeta(req) })
  return ok(toPlain(row), "Payment saved.", undefined, params.id ? 200 : 201)
}

const score = z.number().int().min(1).max(5)

export async function listPerformance(req: Request) {
  const user = await authorize({ module: "performance", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const vendorId = scopeVendor(user, query.vendorId)
  const where = vendorId ? { vendorId } : {}
  const [total, rows] = await Promise.all([
    prisma.vendorPerformance.count({ where }),
    prisma.vendorPerformance.findMany({
      where,
      include: { vendor: { select: { legalName: true } }, reviewer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Performance loaded.", metaOf(total, query.page, query.pageSize))
}

export async function createPerformance(req: Request) {
  const user = await authorize({ module: "performance", action: "CREATE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z
    .object({
      vendorId: z.string(),
      eventId: z.string().optional(),
      quality: score,
      delivery: score,
      pricing: score,
      communication: score,
      compliance: score,
      responsiveness: score,
      service: score,
      staff: score,
      issueResolution: score,
      comments: z.string().optional(),
    })
    .parse(await readJson(req))
  const row = await prisma.vendorPerformance.create({ data: { ...body, reviewerId: user.id } })
  await audit({ userId: user.id, action: "Recorded vendor performance", module: "performance", recordId: row.id, recordLabel: body.vendorId, ...clientMeta(req) })
  return ok(toPlain(row), "Performance recorded.", undefined, 201)
}

export async function listTickets(req: Request) {
  const user = await authorize({ module: "tickets", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const vendorId = scopeVendor(user, query.vendorId)
  const where: Prisma.SupportTicketWhereInput = {
    ...(vendorId ? { vendorId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.category ? { category: query.category as never } : {}),
    ...(query.q ? { OR: [{ subject: { contains: query.q, mode: "insensitive" } }, { number: { contains: query.q, mode: "insensitive" } }] } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      include: { vendor: { select: { legalName: true } }, assignee: { select: { name: true } }, comments: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Tickets loaded.", metaOf(total, query.page, query.pageSize))
}

export async function saveTicket(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "tickets", action: params.id ? "EDIT" : "CREATE" })
  const body = z
    .object({
      vendorId: z.string().optional(),
      category: z.enum(["PAYMENT", "INVOICE", "PO", "EVENT", "DOCUMENTS", "CONTRACT", "TECHNICAL", "GENERAL"]),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
      subject: z.string().min(3),
      description: z.string().min(3),
      status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]).optional(),
      assigneeId: z.string().nullable().optional(),
      resolution: z.string().optional(),
      fileAssetId: z.string().optional(),
    })
    .parse(await readJson(req))
  const vendorId = user.portal === "VENDOR" ? user.vendorId : body.vendorId
  if (params.id) {
    const existing = await prisma.supportTicket.findUnique({ where: { id: params.id } })
    if (!existing) throw new ApiError(404, "Ticket not found.")
    scopeVendor(user, existing.vendorId)
    const row = await prisma.supportTicket.update({
      where: { id: params.id },
      data: {
        status: user.portal === "VENDOR" ? existing.status : body.status || existing.status,
        assigneeId: user.portal === "VENDOR" ? existing.assigneeId : body.assigneeId,
        resolution: user.portal === "VENDOR" ? existing.resolution : body.resolution,
        priority: body.priority,
      },
    })
    return ok(toPlain(row), "Ticket updated.")
  }
  const row = await prisma.supportTicket.create({
    data: {
      number: await nextCode("ticket", "TKT"),
      vendorId: vendorId || null,
      creatorId: user.id,
      category: body.category,
      priority: body.priority || "MEDIUM",
      subject: body.subject,
      description: body.description,
      fileAssetId: body.fileAssetId,
    },
  })
  await notifyStaff("task", { title: row.subject, status: "open" }, "/admin/tickets")
  await audit({ userId: user.id, action: "Opened support ticket", module: "tickets", recordId: row.id, recordLabel: row.number, ...clientMeta(req) })
  return ok(toPlain(row), "Ticket opened.", undefined, 201)
}

export async function commentTicket(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "tickets", action: "EDIT" })
  const body = z.object({ body: z.string().min(1).max(4000) }).parse(await readJson(req))
  const ticket = await prisma.supportTicket.findUnique({ where: { id: params.id } })
  if (!ticket) throw new ApiError(404, "Ticket not found.")
  scopeVendor(user, ticket.vendorId)
  const comment = await prisma.ticketComment.create({ data: { ticketId: ticket.id, authorId: user.id, body: body.body } })
  return ok(comment, "Reply added.", undefined, 201)
}
