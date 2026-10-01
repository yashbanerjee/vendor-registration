import { Prisma, type DocumentStatus } from "@prisma/client"
import { z } from "zod"
import { slugify } from "@/lib/format"
import { audit } from "@/server/audit"
import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"
import { authorize, requireUser, scopeVendor } from "@/server/guard"
import { clientMeta, listQuery, metaOf, ok, parseDate, readJson, toPlain } from "@/server/http"
import { notifyVendorUsers } from "@/server/notify"
import { recalcCompliance } from "@/server/handlers/vendors"

const named = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  active: z.boolean().optional(),
})

export async function listCategories() {
  await authorize({ module: "vendors", action: "VIEW" })
  return ok(await prisma.vendorCategory.findMany({ orderBy: { name: "asc" }, include: { services: true } }), "Categories loaded.")
}

export async function saveCategory(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "settings", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN"] })
  const body = named.extend({ requiredDocumentTypes: z.array(z.string()).optional() }).parse(await readJson(req))
  const data = { name: body.name, slug: slugify(body.name), description: body.description, active: body.active ?? true, requiredDocumentTypes: body.requiredDocumentTypes || [] }
  const row = params.id
    ? await prisma.vendorCategory.update({ where: { id: params.id }, data })
    : await prisma.vendorCategory.create({ data })
  await audit({ userId: user.id, action: params.id ? "Updated category" : "Created category", module: "settings", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(row, "Category saved.")
}

export async function deleteCategory(_req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "settings", action: "DELETE", portals: ["SUPER_ADMIN"] })
  await prisma.vendorCategory.delete({ where: { id: params.id } })
  await audit({ userId: user.id, action: "Deleted category", module: "settings", recordId: params.id })
  return ok({ id: params.id }, "Category deleted.")
}

export async function listServices() {
  await authorize({ module: "vendors", action: "VIEW" })
  return ok(await prisma.vendorService.findMany({ include: { category: true }, orderBy: { name: "asc" } }), "Services loaded.")
}

export async function saveService(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "settings", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN"] })
  const body = named.extend({ categoryId: z.string().nullable().optional() }).parse(await readJson(req))
  const data = { name: body.name, description: body.description, active: body.active ?? true, categoryId: body.categoryId || null }
  const row = params.id ? await prisma.vendorService.update({ where: { id: params.id }, data }) : await prisma.vendorService.create({ data })
  await audit({ userId: user.id, action: "Saved service", module: "settings", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(row, "Service saved.")
}

export async function deleteService(_req: Request, params: Record<string, string>) {
  await authorize({ module: "settings", action: "DELETE", portals: ["SUPER_ADMIN"] })
  await prisma.vendorService.delete({ where: { id: params.id } })
  return ok({ id: params.id }, "Service deleted.")
}

export async function listDocumentTypes() {
  await authorize({ module: "documents", action: "VIEW" })
  return ok(await prisma.documentType.findMany({ orderBy: { name: "asc" } }), "Document types loaded.")
}

export async function saveDocumentType(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "settings", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN"] })
  const body = named.extend({ required: z.boolean().optional(), hasExpiry: z.boolean().optional() }).parse(await readJson(req))
  const data = { name: body.name, slug: slugify(body.name), description: body.description, required: body.required ?? false, hasExpiry: body.hasExpiry ?? true, active: body.active ?? true }
  const row = params.id ? await prisma.documentType.update({ where: { id: params.id }, data }) : await prisma.documentType.create({ data })
  await audit({ userId: user.id, action: "Saved document type", module: "settings", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(row, "Document type saved.")
}

export async function listDocuments(req: Request) {
  const user = await authorize({ module: "documents", action: "VIEW" })
  await refreshDocumentStatuses()
  const query = listQuery(new URL(req.url))
  const vendorId = scopeVendor(user, query.vendorId)
  const where: Prisma.VendorDocumentWhereInput = {
    ...(vendorId ? { vendorId } : {}),
    ...(query.status ? { status: query.status as DocumentStatus } : {}),
    ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.vendorDocument.count({ where }),
    prisma.vendorDocument.findMany({
      where,
      include: { vendor: { select: { id: true, legalName: true, vendorCode: true } }, documentType: true, fileAsset: { omit: { content: true } } },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Documents loaded.", metaOf(total, query.page, query.pageSize))
}

export async function createDocument(req: Request) {
  const user = await authorize({ module: "documents", action: "CREATE" })
  const body = z
    .object({
      vendorId: z.string(),
      documentTypeId: z.string().nullable().optional(),
      title: z.string().min(2),
      fileAssetId: z.string(),
      issueDate: z.string().nullable().optional(),
      expiryDate: z.string().nullable().optional(),
      notes: z.string().max(1000).optional(),
    })
    .parse(await readJson(req))
  const vendorId = scopeVendor(user, body.vendorId)
  const asset = await prisma.fileAsset.findUnique({ where: { id: body.fileAssetId } })
  if (!asset) throw new ApiError(404, "Upload the file before saving the document.")
  if (user.portal === "VENDOR" && asset.vendorId && asset.vendorId !== user.vendorId) {
    throw new ApiError(403, "You cannot attach this file.")
  }
  const doc = await prisma.vendorDocument.create({
    data: {
      vendorId: vendorId || body.vendorId,
      documentTypeId: body.documentTypeId || null,
      title: body.title,
      fileAssetId: asset.id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      issueDate: parseDate(body.issueDate),
      expiryDate: parseDate(body.expiryDate),
      notes: body.notes,
      status: "PENDING",
    },
  })
  await recalcCompliance(doc.vendorId)
  await audit({ userId: user.id, action: "Uploaded document", module: "documents", recordId: doc.id, recordLabel: doc.title, ...clientMeta(req) })
  return ok(toPlain(doc), "Document uploaded.", undefined, 201)
}

export async function reviewDocument(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "documents", action: "APPROVE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z.object({ action: z.enum(["APPROVE", "REJECT"]), note: z.string().max(1000).optional() }).parse(await readJson(req))
  const doc = await prisma.vendorDocument.update({
    where: { id: params.id },
    data: {
      status: body.action === "APPROVE" ? "APPROVED" : "REJECTED",
      reviewerId: user.id,
      rejectionReason: body.action === "REJECT" ? body.note || "Rejected" : null,
    },
    include: { vendor: true },
  })
  await recalcCompliance(doc.vendorId)
  if (body.action === "REJECT") {
    await notifyVendorUsers(doc.vendorId, "document_rejected", { vendor: doc.vendor.legalName, document: doc.title, note: body.note || "" }, "/vendor/documents")
  }
  await audit({ userId: user.id, action: body.action === "APPROVE" ? "Approved document" : "Rejected document", module: "documents", recordId: doc.id, recordLabel: doc.title, ...clientMeta(req) })
  return ok(toPlain(doc), body.action === "APPROVE" ? "Document approved." : "Document rejected.")
}

export async function refreshDocumentStatuses() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "documents.reminderDays" } })
  const days = Array.isArray(setting?.value) ? Math.max(...setting.value.map((value) => Number(value) || 0)) : 60
  const now = new Date()
  const soon = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  await prisma.vendorDocument.updateMany({
    where: { expiryDate: { lt: now }, status: { in: ["APPROVED", "EXPIRING_SOON", "PENDING", "UNDER_REVIEW"] } },
    data: { status: "EXPIRED" },
  })
  await prisma.vendorDocument.updateMany({
    where: { expiryDate: { gte: now, lte: soon }, status: { in: ["APPROVED", "PENDING", "UNDER_REVIEW"] } },
    data: { status: "EXPIRING_SOON" },
  })
}

export async function listCustomFields() {
  await authorize({ module: "settings", action: "VIEW", portals: ["SUPER_ADMIN", "ADMIN"] })
  return ok(await prisma.customField.findMany({ orderBy: { sortOrder: "asc" } }), "Fields loaded.")
}

export async function saveCustomField(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "settings", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN"] })
  const body = z
    .object({
      label: z.string().min(2),
      key: z.string().optional(),
      fieldType: z.enum(["TEXT", "NUMBER", "EMAIL", "PHONE", "DROPDOWN", "MULTI_SELECT", "DATE", "FILE", "CHECKBOX", "RADIO", "TEXTAREA"]),
      placeholder: z.string().optional(),
      helpText: z.string().optional(),
      required: z.boolean().optional(),
      options: z.array(z.string()).optional(),
      categoryIds: z.array(z.string()).optional(),
      section: z.string().default("company"),
      sortOrder: z.number().int().optional(),
      active: z.boolean().optional(),
    })
    .parse(await readJson(req))
  const data = {
    label: body.label,
    key: slugify(body.key || body.label).replace(/-/g, "_"),
    fieldType: body.fieldType,
    placeholder: body.placeholder,
    helpText: body.helpText,
    required: body.required ?? false,
    options: body.options || [],
    categoryIds: body.categoryIds || [],
    section: body.section,
    sortOrder: body.sortOrder ?? 0,
    active: body.active ?? true,
  }
  const row = params.id ? await prisma.customField.update({ where: { id: params.id }, data }) : await prisma.customField.create({ data })
  await audit({ userId: user.id, action: "Saved registration field", module: "settings", recordId: row.id, recordLabel: row.label, ...clientMeta(req) })
  return ok(row, "Field saved.")
}

export async function deleteCustomField(_req: Request, params: Record<string, string>) {
  await authorize({ module: "settings", action: "DELETE", portals: ["SUPER_ADMIN"] })
  await prisma.customField.delete({ where: { id: params.id } })
  return ok({ id: params.id }, "Field deleted.")
}

export async function listTerms() {
  await requireUser()
  return ok(await prisma.paymentTerm.findMany({ where: { active: true }, orderBy: { days: "asc" } }), "Payment terms loaded.")
}

export async function saveTerm(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "settings", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN"] })
  const body = named.extend({ days: z.number().int().min(0).max(365) }).parse(await readJson(req))
  const data = { name: body.name, days: body.days, description: body.description, active: body.active ?? true }
  const row = params.id ? await prisma.paymentTerm.update({ where: { id: params.id }, data }) : await prisma.paymentTerm.create({ data })
  await audit({ userId: user.id, action: "Saved payment term", module: "settings", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(row, "Payment term saved.")
}

export async function listEmirates() {
  await requireUser()
  return ok(await prisma.emirate.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }), "Emirates loaded.")
}

export async function saveEmirate(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "settings", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN"] })
  const body = z.object({ name: z.string().min(2), code: z.string().min(2).max(8), active: z.boolean().optional(), sortOrder: z.number().int().optional() }).parse(await readJson(req))
  const data = { name: body.name, code: body.code.toUpperCase(), active: body.active ?? true, sortOrder: body.sortOrder ?? 0 }
  const row = params.id ? await prisma.emirate.update({ where: { id: params.id }, data }) : await prisma.emirate.create({ data })
  await audit({ userId: user.id, action: "Saved emirate", module: "settings", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(row, "Location saved.")
}

export async function listWorkflows() {
  await authorize({ module: "settings", action: "VIEW", portals: ["SUPER_ADMIN", "ADMIN"] })
  return ok(
    await prisma.approvalWorkflow.findMany({ include: { steps: { orderBy: { sortOrder: "asc" } } }, orderBy: { name: "asc" } }),
    "Workflows loaded.",
  )
}

export async function saveWorkflow(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "settings", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN"] })
  const body = z
    .object({
      name: z.string().min(2),
      module: z.string().default("vendor_registration"),
      categoryId: z.string().nullable().optional(),
      active: z.boolean().optional(),
      steps: z.array(z.object({ name: z.string().min(2), roleSlug: z.string().nullable().optional() })).min(1),
    })
    .parse(await readJson(req))
  if (params.id) {
    await prisma.approvalStep.deleteMany({ where: { workflowId: params.id } })
    const row = await prisma.approvalWorkflow.update({
      where: { id: params.id },
      data: {
        name: body.name,
        module: body.module,
        categoryId: body.categoryId || null,
        active: body.active ?? true,
        steps: { create: body.steps.map((step, index) => ({ name: step.name, roleSlug: step.roleSlug || null, sortOrder: index + 1 })) },
      },
      include: { steps: true },
    })
    await audit({ userId: user.id, action: "Updated workflow", module: "settings", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
    return ok(row, "Workflow updated.")
  }
  const row = await prisma.approvalWorkflow.create({
    data: {
      name: body.name,
      module: body.module,
      categoryId: body.categoryId || null,
      active: body.active ?? true,
      steps: { create: body.steps.map((step, index) => ({ name: step.name, roleSlug: step.roleSlug || null, sortOrder: index + 1 })) },
    },
    include: { steps: true },
  })
  await audit({ userId: user.id, action: "Created workflow", module: "settings", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(row, "Workflow created.", undefined, 201)
}

export async function deleteWorkflow(_req: Request, params: Record<string, string>) {
  await authorize({ module: "settings", action: "DELETE", portals: ["SUPER_ADMIN"] })
  const used = await prisma.approvalRequest.count({ where: { workflowId: params.id } })
  if (used) throw new ApiError(409, "This workflow already has requests. Deactivate it instead of deleting it.")
  await prisma.approvalWorkflow.delete({ where: { id: params.id } })
  return ok({ id: params.id }, "Workflow deleted.")
}
