import { Prisma } from "@prisma/client"
import ExcelJS from "exceljs"
import { z } from "zod"
import { FEATURE_CATALOG } from "@/lib/constants"
import type { HomepageContent } from "@/lib/types"
import { audit } from "@/server/audit"
import { encryptSecret } from "@/server/crypto"
import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"
import { readAsset, saveUpload } from "@/server/files"
import { authorize, isFeatureEnabled, requireUser } from "@/server/guard"
import { clientMeta, fileResponse, listQuery, metaOf, ok, rateLimit, readJson, toPlain } from "@/server/http"
import { identitySetPassword, managedPassword, provisionIdentity } from "@/server/identity-client"
import { notifyUsers } from "@/server/notify"
import { refreshDocumentStatuses } from "@/server/handlers/catalog"
import { slugify } from "@/lib/format"

const passwordSchema = z.string().min(8).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/)

export async function runMaintenance() {
  const marker = await prisma.systemSetting.findUnique({ where: { key: "jobs.lastRun" } })
  if (marker && Date.now() - Number(marker.value) < 60 * 60 * 1000) return
  const setting = await prisma.systemSetting.findUnique({ where: { key: "documents.reminderDays" } })
  const days = Array.isArray(setting?.value) ? Math.max(...setting.value.map((value) => Number(value) || 0)) : 60
  const now = new Date()
  const soon = new Date(Date.now() + days * 86400000)
  const expiring = await prisma.vendorDocument.findMany({
    where: { expiryDate: { gte: now, lte: soon }, status: { in: ["APPROVED", "PENDING", "UNDER_REVIEW"] } },
    include: { vendor: true },
  })
  await refreshDocumentStatuses()
  for (const doc of expiring) {
    await notifyUsers(
      (await prisma.user.findMany({ where: { vendorId: doc.vendorId, status: "ACTIVE" }, select: { id: true } })).map((user) => user.id),
      "document_expiry",
      { document: doc.title, vendor: doc.vendor.legalName, date: doc.expiryDate?.toISOString().slice(0, 10) || "" },
      "/vendor/documents",
    )
  }
  await prisma.payment.updateMany({
    where: { dueDate: { lt: now }, status: { in: ["PENDING", "APPROVED", "PARTIALLY_PAID"] } },
    data: { status: "OVERDUE" },
  })
  const contracts = await prisma.contract.findMany({
    where: { status: "ACTIVE", endDate: { lte: soon } },
    include: { vendor: true },
  })
  for (const contract of contracts) {
    const expired = contract.endDate && contract.endDate < now
    await prisma.contract.update({ where: { id: contract.id }, data: { status: expired ? "EXPIRED" : "EXPIRING" } })
    if (!expired) {
      await notifyUsers(
        (await prisma.user.findMany({ where: { portal: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" }, select: { id: true } })).map((user) => user.id),
        "contract_expiry",
        { title: contract.title, vendor: contract.vendor.legalName, date: contract.endDate?.toISOString().slice(0, 10) || "" },
        "/admin/contracts",
      )
    }
  }
  await prisma.systemSetting.upsert({
    where: { key: "jobs.lastRun" },
    update: { value: Date.now() },
    create: { key: "jobs.lastRun", value: Date.now(), group: "jobs" },
  })
}

export async function dashboard(req: Request) {
  const user = await requireUser()
  await runMaintenance()
  const vendorId = user.portal === "VENDOR" ? user.vendorId : null
  if (user.portal === "VENDOR" && !vendorId) throw new ApiError(403, "Vendor profile missing.")
  const vendorWhere = vendorId ? { vendorId } : {}
  const [
    vendors,
    pendingVendors,
    approvedVendors,
    activeVendors,
    suspendedVendors,
    expiringDocs,
    pendingApprovals,
    activeEvents,
    activeRfqs,
    pendingQuotations,
    activePos,
    pendingInvoices,
    outstanding,
  ] = await Promise.all([
    prisma.vendor.count({ where: { deletedAt: null, ...(vendorId ? { id: vendorId } : {}) } }),
    prisma.vendor.count({ where: { deletedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] }, ...(vendorId ? { id: vendorId } : {}) } }),
    prisma.vendor.count({ where: { deletedAt: null, status: "APPROVED", ...(vendorId ? { id: vendorId } : {}) } }),
    prisma.vendor.count({ where: { deletedAt: null, status: "ACTIVE", ...(vendorId ? { id: vendorId } : {}) } }),
    prisma.vendor.count({ where: { deletedAt: null, status: "SUSPENDED", ...(vendorId ? { id: vendorId } : {}) } }),
    prisma.vendorDocument.count({ where: { ...vendorWhere, status: { in: ["EXPIRING_SOON", "EXPIRED"] } } }),
    prisma.approvalRequest.count({ where: { status: "PENDING", ...(vendorId ? { vendorId } : {}) } }),
    prisma.event.count({ where: { deletedAt: null, status: "ACTIVE", ...(vendorId ? { vendors: { some: { vendorId } } } : {}) } }),
    prisma.rfq.count({ where: { status: { in: ["SENT", "DRAFT"] }, ...(vendorId ? { vendors: { some: { vendorId } } } : {}) } }),
    prisma.quotation.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] }, ...vendorWhere } }),
    prisma.purchaseOrder.count({ where: { status: { in: ["ISSUED", "ACKNOWLEDGED", "PARTIALLY_FULFILLED"] }, ...vendorWhere } }),
    prisma.invoice.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] }, ...vendorWhere } }),
    prisma.payment.aggregate({ where: { status: { in: ["PENDING", "APPROVED", "PARTIALLY_PAID", "OVERDUE"] }, ...vendorWhere }, _sum: { amount: true, paidAmount: true } }),
  ])

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date()
    date.setMonth(date.getMonth() - (5 - index))
    return { key: `${date.getFullYear()}-${date.getMonth()}`, label: date.toLocaleString("en-AE", { month: "short" }), start: new Date(date.getFullYear(), date.getMonth(), 1), end: new Date(date.getFullYear(), date.getMonth() + 1, 1) }
  })
  const registrations = []
  const approvals = []
  for (const month of months) {
    registrations.push({
      month: month.label,
      count: await prisma.vendor.count({ where: { createdAt: { gte: month.start, lt: month.end }, ...(vendorId ? { id: vendorId } : {}) } }),
    })
    approvals.push({
      month: month.label,
      count: await prisma.vendor.count({ where: { approvedAt: { gte: month.start, lt: month.end }, ...(vendorId ? { id: vendorId } : {}) } }),
    })
  }
  const categoryGroups = await prisma.vendorCategory.findMany({
    include: { _count: { select: { vendors: true } } },
    orderBy: { name: "asc" },
  })
  const eventGroups = await prisma.event.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { vendors: true } } },
    orderBy: { startDate: "desc" },
    take: 6,
  })
  const spend = await prisma.purchaseOrder.groupBy({
    by: ["vendorId"],
    _sum: { total: true },
    orderBy: { _sum: { total: "desc" } },
    take: 6,
    where: vendorId ? { vendorId } : {},
  })
  const spendVendors = await prisma.vendor.findMany({ where: { id: { in: spend.map((item) => item.vendorId) } }, select: { id: true, legalName: true } })
  const invoiceGroups = await prisma.invoice.groupBy({ by: ["status"], _count: true, where: vendorWhere })
  const compliance = await prisma.vendor.groupBy({
    by: ["status"],
    _count: true,
    where: { deletedAt: null, ...(vendorId ? { id: vendorId } : {}) },
  })
  const openTasks = await prisma.task.count({ where: { ...vendorWhere, status: { in: ["PENDING", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW"] } } })
  const vendor = vendorId
    ? await prisma.vendor.findUnique({
        where: { id: vendorId },
        include: { fieldReviews: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" } } },
      })
    : null

  return ok(
    {
      vendor,
      stats: {
        totalVendors: vendors,
        pendingVendors,
        approvedVendors,
        activeVendors,
        suspendedVendors,
        expiringDocs,
        pendingApprovals,
        activeEvents,
        activeRfqs,
        pendingQuotations,
        activePos,
        pendingInvoices,
        outstandingPayments: Number(outstanding._sum.amount || 0) - Number(outstanding._sum.paidAmount || 0),
        openTasks,
      },
      registrations,
      approvals,
      categories: categoryGroups.map((item) => ({ name: item.name, count: item._count.vendors })),
      events: eventGroups.map((item) => ({ name: item.name, count: item._count.vendors })),
      spending: spend.map((item) => ({ name: spendVendors.find((vendorRow) => vendorRow.id === item.vendorId)?.legalName || "Vendor", total: Number(item._sum.total || 0) })),
      invoices: invoiceGroups.map((item) => ({ status: item.status, count: item._count })),
      compliance: compliance.map((item) => ({ label: item.status, count: item._count })),
    },
    "Dashboard loaded.",
  )
}

export async function search(req: Request) {
  const user = await requireUser()
  const q = new URL(req.url).searchParams.get("q")?.trim() || ""
  if (q.length < 2) return ok({ vendors: [], events: [], rfqs: [], quotations: [], purchaseOrders: [], contracts: [], invoices: [], tasks: [] }, "Enter at least 2 characters.")
  const vendorScope = user.portal === "VENDOR" ? user.vendorId || "__none__" : undefined
  const take = 5
  const [vendors, events, rfqs, quotations, purchaseOrders, contracts, invoices, tasks] = await Promise.all([
    (await isFeatureEnabled("vendorRegistration"))
      ? prisma.vendor.findMany({
          where: { deletedAt: null, ...(vendorScope ? { id: vendorScope } : {}), OR: [{ legalName: { contains: q, mode: "insensitive" } }, { vendorCode: { contains: q, mode: "insensitive" } }] },
          select: { id: true, legalName: true, vendorCode: true, status: true },
          take,
        })
      : [],
    (await isFeatureEnabled("events"))
      ? prisma.event.findMany({
          where: { deletedAt: null, ...(vendorScope ? { vendors: { some: { vendorId: vendorScope } } } : {}), OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] },
          select: { id: true, name: true, code: true, status: true },
          take,
        })
      : [],
    (await isFeatureEnabled("rfq"))
      ? prisma.rfq.findMany({
          where: { ...(vendorScope ? { vendors: { some: { vendorId: vendorScope } } } : {}), OR: [{ title: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }] },
          select: { id: true, number: true, title: true, status: true },
          take,
        })
      : [],
    (await isFeatureEnabled("quotation"))
      ? prisma.quotation.findMany({
          where: { ...(vendorScope ? { vendorId: vendorScope } : {}), number: { contains: q, mode: "insensitive" } },
          select: { id: true, number: true, status: true },
          take,
        })
      : [],
    (await isFeatureEnabled("purchaseOrder"))
      ? prisma.purchaseOrder.findMany({
          where: { ...(vendorScope ? { vendorId: vendorScope } : {}), number: { contains: q, mode: "insensitive" } },
          select: { id: true, number: true, status: true },
          take,
        })
      : [],
    (await isFeatureEnabled("contract"))
      ? prisma.contract.findMany({
          where: { ...(vendorScope ? { vendorId: vendorScope } : {}), OR: [{ title: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }] },
          select: { id: true, number: true, title: true, status: true },
          take,
        })
      : [],
    (await isFeatureEnabled("invoices"))
      ? prisma.invoice.findMany({
          where: { ...(vendorScope ? { vendorId: vendorScope } : {}), number: { contains: q, mode: "insensitive" } },
          select: { id: true, number: true, status: true },
          take,
        })
      : [],
    (await isFeatureEnabled("tasks"))
      ? prisma.task.findMany({
          where: { ...(vendorScope ? { vendorId: vendorScope } : {}), title: { contains: q, mode: "insensitive" } },
          select: { id: true, title: true, status: true },
          take,
        })
      : [],
  ])
  return ok({ vendors, events, rfqs, quotations, purchaseOrders, contracts, invoices, tasks }, "Search results.")
}

export async function lookups() {
  const user = await requireUser()
  const [categories, services, emirates, terms, documentTypes, vendors, events, users, tax, roles] = await Promise.all([
    prisma.vendorCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.vendorService.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.emirate.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.paymentTerm.findMany({ where: { active: true }, orderBy: { days: "asc" } }),
    prisma.documentType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.vendor.findMany({
      where: { deletedAt: null, ...(user.portal === "VENDOR" ? { id: user.vendorId || "" } : {}), status: { in: ["APPROVED", "ACTIVE", "SUBMITTED", "UNDER_REVIEW", "DRAFT"] } },
      select: { id: true, legalName: true, vendorCode: true, status: true },
      orderBy: { legalName: "asc" },
      take: 300,
    }),
    prisma.event.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    user.portal === "VENDOR" ? [] : prisma.user.findMany({ where: { deletedAt: null, portal: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.taxSetting.findUnique({ where: { id: "default" } }),
    user.portal === "VENDOR" ? [] : prisma.role.findMany({ orderBy: { name: "asc" } }),
  ])
  return ok(toPlain({ categories, services, emirates, terms, documentTypes, vendors, events, users, tax, roles }), "Lookups loaded.")
}

export async function upload(req: Request) {
  const user = await requireUser()
  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) throw new ApiError(400, "Choose a file to upload.")
  const isPublic = form.get("public") === "true" && user.portal === "SUPER_ADMIN"
  const asset = await saveUpload(file, { public: isPublic, vendorId: user.vendorId, userId: user.id })
  await audit({ userId: user.id, action: "Uploaded file", module: "documents", recordId: asset.id, recordLabel: asset.fileName, ...clientMeta(req) })
  return ok({ id: asset.id, fileName: asset.fileName, url: `/api/files/${asset.id}` }, "File uploaded.", undefined, 201)
}

export async function downloadFile(_req: Request, params: Record<string, string>) {
  const asset = await prisma.fileAsset.findUnique({ where: { id: params.id } })
  if (!asset) throw new ApiError(404, "File not found.")
  if (!asset.public) {
    const user = await requireUser()
    if (user.portal === "VENDOR" && asset.vendorId && asset.vendorId !== user.vendorId && asset.createdBy !== user.id) {
      throw new ApiError(403, "You cannot download this file.")
    }
  }
  const bytes = await readAsset(asset.storedName)
  return fileResponse(bytes, asset.mimeType, asset.fileName)
}

export async function publicSite() {
  const [company, features] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: "default" } }),
    prisma.featureFlag.findMany({ where: { enabled: true }, select: { key: true, name: true } }),
  ])
  return ok({ company, features }, "Site loaded.")
}

export async function publicContact(req: Request) {
  const meta = clientMeta(req)
  rateLimit(`contact:${meta.ip || "local"}`, 5, 60 * 60 * 1000)
  const body = z.object({ name: z.string().min(2), email: z.string().email(), company: z.string().optional(), phone: z.string().optional(), message: z.string().min(10).max(4000) }).parse(await readJson(req))
  const row = await prisma.inquiry.create({ data: body })
  return ok({ id: row.id }, "Message received. The team will reply using the contact details configured for this site.")
}

export async function getCompany() {
  await authorize({ module: "settings", action: "VIEW", portals: ["SUPER_ADMIN", "ADMIN"] })
  return ok(await prisma.companySetting.findUnique({ where: { id: "default" } }), "Company settings loaded.")
}

export async function saveCompany(req: Request) {
  const user = await authorize({ module: "settings", action: "EDIT", portals: ["SUPER_ADMIN"] })
  const body = z
    .object({
      companyName: z.string().min(2).optional(),
      legalName: z.string().optional(),
      logoUrl: z.string().nullable().optional(),
      faviconUrl: z.string().nullable().optional(),
      email: z.union([z.string().email(), z.literal("")]).nullish(),
      phone: z.string().nullish(),
      website: z.string().nullish(),
      address: z.string().nullish(),
      emirate: z.string().nullish(),
      country: z.string().nullish(),
      tagline: z.string().nullish(),
      about: z.string().nullish(),
      heroHeadline: z.string().nullish(),
      heroSubtext: z.string().nullish(),
      privacyPolicy: z.string().nullish(),
      terms: z.string().nullish(),
      primaryColor: z.union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.literal("")]).nullish(),
      secondaryColor: z.union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.literal("")]).nullish(),
      defaultTheme: z.enum(["light", "dark", "system"]).nullish(),
      currency: z.string().min(3).max(3).nullish(),
      timezone: z.string().nullish(),
      homepage: z.custom<HomepageContent>().nullish(),
    })
    .parse(await readJson(req))
  const cleaned = Object.fromEntries(
    Object.entries({
      ...body,
      email: body.email || undefined,
      primaryColor: body.primaryColor || undefined,
      secondaryColor: body.secondaryColor || undefined,
      defaultTheme: body.defaultTheme || undefined,
      currency: body.currency || undefined,
      homepage: body.homepage || undefined,
    }).filter(([, value]) => value !== null && value !== undefined),
  )
  const row = await prisma.companySetting.update({ where: { id: "default" }, data: cleaned as Prisma.CompanySettingUpdateInput })
  await audit({ userId: user.id, action: "Updated company settings", module: "settings", recordId: "default", recordLabel: row.companyName, ...clientMeta(req) })
  return ok(row, "Company settings saved.")
}

export async function getTax() {
  await authorize({ module: "settings", action: "VIEW", portals: ["SUPER_ADMIN", "ADMIN"] })
  return ok(toPlain(await prisma.taxSetting.findUnique({ where: { id: "default" } })), "Tax settings loaded.")
}

export async function saveTax(req: Request) {
  const user = await authorize({ module: "settings", action: "EDIT", portals: ["SUPER_ADMIN"] })
  const body = z
    .object({
      vatEnabled: z.boolean(),
      vatRate: z.number().min(0).max(100),
      vatLabel: z.string().min(1),
      trnRequired: z.boolean(),
      corporateTaxNote: z.string().optional(),
      currency: z.string().min(3).max(3),
    })
    .parse(await readJson(req))
  const row = await prisma.taxSetting.update({ where: { id: "default" }, data: body })
  await audit({ userId: user.id, action: "Updated tax settings", module: "settings", recordLabel: body.vatLabel, ...clientMeta(req) })
  return ok(toPlain(row), "Tax settings saved.")
}

export async function getSystemSettings() {
  await authorize({ module: "settings", action: "VIEW", portals: ["SUPER_ADMIN"] })
  const rows = await prisma.systemSetting.findMany({ where: { isSecret: false }, orderBy: { key: "asc" } })
  return ok(rows, "System settings loaded.")
}

export async function saveSystemSetting(req: Request) {
  const user = await authorize({ module: "settings", action: "EDIT", portals: ["SUPER_ADMIN"] })
  const body = z.object({ key: z.enum(["documents.reminderDays", "uploads.maxMb", "registration.allowPublic"]), value: z.unknown() }).parse(await readJson(req))
  if (body.key === "documents.reminderDays" && (!Array.isArray(body.value) || body.value.some((item) => Number(item) <= 0))) {
    throw new ApiError(422, "Reminder days must be a list of positive numbers.")
  }
  if (body.key === "uploads.maxMb" && (Number(body.value) < 1 || Number(body.value) > 25)) {
    throw new ApiError(422, "Upload limit must be between 1 and 25 MB.")
  }
  const row = await prisma.systemSetting.upsert({
    where: { key: body.key },
    update: { value: body.value as never },
    create: { key: body.key, value: body.value as never, group: "general" },
  })
  await audit({ userId: user.id, action: "Updated system setting", module: "settings", recordLabel: body.key, ...clientMeta(req) })
  return ok(row, "Setting saved.")
}

export async function listFeatures() {
  await authorize({ module: "features", action: "VIEW", portals: ["SUPER_ADMIN"] })
  const rows = await prisma.featureFlag.findMany({ orderBy: { sortOrder: "asc" } })
  return ok(rows.length ? rows : FEATURE_CATALOG, "Features loaded.")
}

export async function saveFeature(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "features", action: "MANAGE", portals: ["SUPER_ADMIN"] })
  const body = z.object({ enabled: z.boolean() }).parse(await readJson(req))
  const row = await prisma.featureFlag.update({ where: { key: params.key }, data: { enabled: body.enabled } })
  await audit({ userId: user.id, action: body.enabled ? "Enabled feature" : "Disabled feature", module: "features", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(row, `${row.name} is now ${row.enabled ? "on" : "off"}.`)
}

export async function listIntegrations() {
  await authorize({ module: "settings", action: "VIEW", portals: ["SUPER_ADMIN"] })
  const rows = await prisma.integrationSetting.findMany()
  return ok(rows.map((row) => ({ id: row.id, provider: row.provider, enabled: row.enabled, config: row.config, hasSecret: Boolean(row.secretCipher) })), "Integrations loaded.")
}

export async function saveIntegration(req: Request) {
  const user = await authorize({ module: "settings", action: "EDIT", portals: ["SUPER_ADMIN"] })
  const body = z.object({ provider: z.string().min(2), enabled: z.boolean(), config: z.record(z.string(), z.unknown()).optional(), secret: z.string().optional() }).parse(await readJson(req))
  const config = (body.config || {}) as Prisma.InputJsonValue
  const row = await prisma.integrationSetting.upsert({
    where: { provider: body.provider },
    update: { enabled: body.enabled, config, ...(body.secret ? { secretCipher: await encryptSecret(body.secret) } : {}) },
    create: { provider: body.provider, enabled: body.enabled, config, secretCipher: body.secret ? await encryptSecret(body.secret) : null },
  })
  await audit({ userId: user.id, action: "Updated integration", module: "settings", recordLabel: body.provider, ...clientMeta(req) })
  return ok({ provider: row.provider, enabled: row.enabled, hasSecret: Boolean(row.secretCipher) }, "Integration saved. Secrets are encrypted before they are stored.")
}

export async function listUsers(req: Request) {
  const actor = await authorize({ module: "users", action: "VIEW", portals: ["SUPER_ADMIN", "ADMIN"] })
  const query = listQuery(new URL(req.url))
  const where = {
    deletedAt: null,
    ...(actor.portal === "SUPER_ADMIN" ? { memberships: { some: { isOrgAdmin: true } } } : { organizationId: actor.organizationId || "none", portal: "ADMIN" as const }),
    ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" as const } }, { email: { contains: query.q, mode: "insensitive" as const } }] } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, portal: true, status: true, role: { select: { name: true, slug: true } }, vendor: { select: { legalName: true } }, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(rows, "Users loaded.", metaOf(total, query.page, query.pageSize))
}

export async function saveUser(req: Request, params: Record<string, string>) {
  const actor = await authorize({ module: "users", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      password: passwordSchema.optional(),
      phone: z.string().optional(),
      portal: z.enum(["SUPER_ADMIN", "ADMIN", "VENDOR"]),
      roleId: z.string(),
      vendorId: z.string().nullable().optional(),
      status: z.enum(["ACTIVE", "INVITED", "SUSPENDED"]).optional(),
    })
    .parse(await readJson(req))
  if (actor.portal !== "SUPER_ADMIN") throw new ApiError(403, "Only a super admin can create or edit staff accounts.")
  if (body.portal !== "ADMIN" && body.portal !== "SUPER_ADMIN") throw new ApiError(422, "Register vendors from the Vendors page. An email address is enough.")
  if (body.portal === "SUPER_ADMIN" && actor.portal !== "SUPER_ADMIN") throw new ApiError(403, "Only a super admin can assign that portal.")
  if (!params.id && !body.password) throw new ApiError(422, "A password is required for a new user.")
  const identityUserId = body.password ? await provisionIdentity(body.email, body.password) : undefined
  if (identityUserId && body.password) await identitySetPassword(identityUserId, body.password)
  const data = {
    name: body.name,
    email: body.email.toLowerCase(),
    phone: body.phone,
    portal: body.portal,
    roleId: body.roleId,
    vendorId: body.vendorId || null,
    status: body.status || "ACTIVE",
    ...(identityUserId ? { identityUserId, passwordHash: managedPassword() } : {}),
  }
  const row = params.id ? await prisma.user.update({ where: { id: params.id }, data }) : await prisma.user.create({ data: data as never })
  await audit({ userId: actor.id, action: params.id ? "Updated user" : "Created user", module: "users", recordId: row.id, recordLabel: row.email, ...clientMeta(req) })
  return ok({ id: row.id, email: row.email }, "User saved.", undefined, params.id ? 200 : 201)
}

export async function deleteUser(req: Request, params: Record<string, string>) {
  const actor = await authorize({ module: "users", action: "DELETE", portals: ["SUPER_ADMIN"] })
  if (actor.id === params.id) throw new ApiError(409, "You cannot archive your own account.")
  await prisma.user.update({ where: { id: params.id }, data: { deletedAt: new Date(), status: "SUSPENDED" } })
  await audit({ userId: actor.id, action: "Archived user", module: "users", recordId: params.id, ...clientMeta(req) })
  return ok({ id: params.id }, "User archived.")
}

export async function listRoles() {
  await authorize({ module: "roles", action: "VIEW", portals: ["SUPER_ADMIN"] })
  return ok(await prisma.role.findMany({ include: { permissions: true, _count: { select: { users: true } } }, orderBy: { name: "asc" } }), "Roles loaded.")
}

export async function saveRole(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "roles", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN"] })
  const body = z
    .object({
      name: z.string().min(2),
      description: z.string().optional(),
      portal: z.enum(["SUPER_ADMIN", "ADMIN", "VENDOR"]),
      permissions: z.array(z.object({ module: z.string(), actions: z.array(z.string()) })),
    })
    .parse(await readJson(req))
  const role = params.id
    ? await prisma.role.update({ where: { id: params.id }, data: { name: body.name, description: body.description, portal: body.portal } })
    : await prisma.role.create({ data: { name: body.name, slug: slugify(body.name), description: body.description, portal: body.portal } })
  await prisma.permission.deleteMany({ where: { roleId: role.id } })
  await prisma.permission.createMany({ data: body.permissions.map((permission) => ({ roleId: role.id, module: permission.module, actions: permission.actions })) })
  await audit({ userId: user.id, action: "Saved role", module: "roles", recordId: role.id, recordLabel: role.name, ...clientMeta(req) })
  return ok(role, "Role saved.")
}

export async function deleteRole(_req: Request, params: Record<string, string>) {
  await authorize({ module: "roles", action: "DELETE", portals: ["SUPER_ADMIN"] })
  const role = await prisma.role.findUnique({ where: { id: params.id } })
  if (!role) throw new ApiError(404, "Role not found.")
  if (role.isSystem) throw new ApiError(409, "System roles cannot be deleted.")
  await prisma.role.delete({ where: { id: params.id } })
  return ok({ id: params.id }, "Role deleted.")
}

export async function listNotifications(req: Request) {
  const user = await authorize({ module: "notifications", action: "VIEW" })
  const rows = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 40 })
  const unread = rows.filter((row) => !row.readAt).length
  return ok({ rows, unread }, "Notifications loaded.")
}

export async function readNotifications(req: Request) {
  const user = await authorize({ module: "notifications", action: "VIEW" })
  const body = z.object({ ids: z.array(z.string()).optional() }).parse(await readJson(req))
  await prisma.notification.updateMany({
    where: { userId: user.id, ...(body.ids?.length ? { id: { in: body.ids } } : {}), readAt: null },
    data: { readAt: new Date() },
  })
  return ok(null, "Notifications marked as read.")
}

export async function listTemplates() {
  await authorize({ module: "notifications", action: "VIEW", portals: ["SUPER_ADMIN"] })
  return ok(await prisma.notificationTemplate.findMany({ orderBy: { name: "asc" } }), "Templates loaded.")
}

export async function saveTemplate(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "settings", action: "EDIT", portals: ["SUPER_ADMIN"] })
  const body = z.object({ name: z.string(), subject: z.string(), body: z.string(), active: z.boolean().optional() }).parse(await readJson(req))
  const row = await prisma.notificationTemplate.update({ where: { id: params.id }, data: body })
  await audit({ userId: user.id, action: "Updated notification template", module: "notifications", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(row, "Template saved.")
}

export async function listAudit(req: Request) {
  await authorize({ module: "audit", action: "VIEW", portals: ["SUPER_ADMIN", "ADMIN"] })
  const query = listQuery(new URL(req.url))
  const where = {
    ...(query.q ? { OR: [{ action: { contains: query.q, mode: "insensitive" as const } }, { recordLabel: { contains: query.q, mode: "insensitive" as const } }, { module: { contains: query.q, mode: "insensitive" as const } }] } : {}),
    ...(query.from || query.to ? { createdAt: { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip: query.skip, take: query.pageSize }),
  ])
  return ok(toPlain(rows), "Audit log loaded.", metaOf(total, query.page, query.pageSize))
}

const reportTypes = ["vendors", "registrations", "approvals", "compliance", "expiry", "events", "rfqs", "quotations", "purchaseOrders", "contracts", "invoices", "payments", "performance", "spend"] as const

export async function report(req: Request) {
  const user = await authorize({ module: "reports", action: "VIEW" })
  const url = new URL(req.url)
  const type = url.searchParams.get("type") || "vendors"
  if (!reportTypes.includes(type as never)) throw new ApiError(422, "Unknown report.")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const range = from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined
  const vendorId = user.portal === "VENDOR" ? user.vendorId : url.searchParams.get("vendorId") || undefined
  const rows = await reportRows(type, range, vendorId || undefined)
  const format = url.searchParams.get("format")
  if (format === "csv" || format === "xlsx") {
    await authorize({ module: "reports", action: "EXPORT" })
    return exportRows(rows, `${type}-report`, format)
  }
  return ok(rows, "Report loaded.")
}

async function reportRows(type: string, range: { gte?: Date; lte?: Date } | undefined, vendorId?: string) {
  if (type === "vendors" || type === "registrations" || type === "approvals" || type === "compliance") {
    return prisma.vendor.findMany({
      where: { deletedAt: null, ...(vendorId ? { id: vendorId } : {}), ...(range ? { createdAt: range } : {}), ...(type === "approvals" ? { approvedAt: { not: null } } : {}) },
      select: { vendorCode: true, legalName: true, tradeName: true, status: true, emirate: true, complianceScore: true, trn: true, vatStatus: true, createdAt: true, approvedAt: true },
      take: 1000,
      orderBy: { createdAt: "desc" },
    })
  }
  if (type === "expiry") {
    return prisma.vendorDocument.findMany({
      where: { ...(vendorId ? { vendorId } : {}), status: { in: ["EXPIRING_SOON", "EXPIRED"] } },
      include: { vendor: { select: { legalName: true } }, documentType: { select: { name: true } } },
      take: 1000,
    })
  }
  if (type === "events") return prisma.event.findMany({ where: { deletedAt: null, ...(range ? { startDate: range } : {}) }, include: { _count: { select: { vendors: true } } }, take: 1000 })
  if (type === "rfqs") return prisma.rfq.findMany({ where: { ...(range ? { createdAt: range } : {}), ...(vendorId ? { vendors: { some: { vendorId } } } : {}) }, take: 1000 })
  if (type === "quotations") return prisma.quotation.findMany({ where: { ...(vendorId ? { vendorId } : {}), ...(range ? { createdAt: range } : {}) }, include: { vendor: { select: { legalName: true } } }, take: 1000 })
  if (type === "purchaseOrders" || type === "spend") return prisma.purchaseOrder.findMany({ where: { ...(vendorId ? { vendorId } : {}), ...(range ? { createdAt: range } : {}) }, include: { vendor: { select: { legalName: true } } }, take: 1000 })
  if (type === "contracts") return prisma.contract.findMany({ where: { ...(vendorId ? { vendorId } : {}) }, include: { vendor: { select: { legalName: true } } }, take: 1000 })
  if (type === "invoices") return prisma.invoice.findMany({ where: { ...(vendorId ? { vendorId } : {}), ...(range ? { invoiceDate: range } : {}) }, include: { vendor: { select: { legalName: true } } }, take: 1000 })
  if (type === "payments") return prisma.payment.findMany({ where: { ...(vendorId ? { vendorId } : {}), ...(range ? { createdAt: range } : {}) }, include: { vendor: { select: { legalName: true } } }, take: 1000 })
  return prisma.vendorPerformance.findMany({ where: { ...(vendorId ? { vendorId } : {}) }, include: { vendor: { select: { legalName: true } } }, take: 1000 })
}

async function exportRows(rows: unknown[], name: string, format: "csv" | "xlsx") {
  const plain = toPlain(rows) as Record<string, unknown>[]
  const flat = plain.map((row) => flatten(row))
  const headers = [...new Set(flat.flatMap((row) => Object.keys(row)))]
  if (format === "csv") {
    const lines = [headers.join(","), ...flat.map((row) => headers.map((header) => csvCell(row[header])).join(","))]
    return fileResponse(Buffer.from(lines.join("\n")), "text/csv; charset=utf-8", `${name}.csv`)
  }
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Report")
  sheet.addRow(headers)
  for (const row of flat) sheet.addRow(headers.map((header) => row[header] ?? ""))
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  return fileResponse(buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${name}.xlsx`)
}

function flatten(value: unknown, prefix = ""): Record<string, string | number | boolean | null> {
  if (value === null || value === undefined) return prefix ? { [prefix]: null } : {}
  if (typeof value !== "object" || value instanceof Date) return { [prefix || "value"]: value instanceof Date ? value.toISOString() : (value as never) }
  if (Array.isArray(value)) return { [prefix || "items"]: value.length }
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string | number | boolean | null>>((acc, [key, item]) => {
    const next = prefix ? `${prefix}.${key}` : key
    if (item && typeof item === "object" && !Array.isArray(item)) Object.assign(acc, flatten(item, next))
    else acc[next] = item == null ? null : Array.isArray(item) ? item.length : (item as never)
    return acc
  }, {})
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export async function health() {
  await prisma.$queryRaw`SELECT 1`
  return ok({ status: "ok" }, "Database connection is healthy.")
}
