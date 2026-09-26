import { randomBytes } from "crypto"
import { Prisma, type VendorStatus } from "@prisma/client"
import { z } from "zod"
import { COMPANY_TYPES, VAT_STATUSES, VENDOR_STATUSES, ZONE_TYPES } from "@/lib/constants"
import type { PublicUser } from "@/lib/types"
import { audit } from "@/server/audit"
import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"
import { authorize, isFeatureEnabled, scopeVendor } from "@/server/guard"
import { allowedSort, clientMeta, listQuery, metaOf, ok, parseDate, readJson, toPlain } from "@/server/http"
import { nextCode } from "@/server/numbers"
import { notifyStaff, notifyVendorUsers } from "@/server/notify"
import { managedPassword, provisionIdentity } from "@/server/identity-client"
import { assertSameOrg, businessScope } from "@/server/tenant"
import { publishEvent } from "@/server/events/outbox"
import { requestOrigin, sendMail } from "@/server/mail"
import { can } from "@/lib/permissions"

const vendorSchema = z.object({
  legalName: z.string().min(2).max(180).optional(),
  tradeName: z.string().max(180).nullable().optional(),
  tradeLicenseNumber: z.string().max(80).nullable().optional(),
  licenseAuthority: z.string().max(180).nullable().optional(),
  licenseIssueDate: z.string().nullable().optional(),
  licenseExpiryDate: z.string().nullable().optional(),
  companyType: z.string().nullable().optional(),
  businessActivity: z.string().max(800).nullable().optional(),
  zoneType: z.string().nullable().optional(),
  emirate: z.string().max(80).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  website: z.string().max(200).nullable().optional(),
  trn: z.string().max(30).nullable().optional(),
  vatStatus: z.string().nullable().optional(),
  corporateTaxInfo: z.string().max(2000).nullable().optional(),
  bankName: z.string().max(180).nullable().optional(),
  iban: z.string().max(42).nullable().optional(),
  accountName: z.string().max(180).nullable().optional(),
  paymentTermId: z.string().nullable().optional(),
  categoryIds: z.array(z.string()).optional(),
  serviceIds: z.array(z.string()).optional(),
  contact: z
    .object({
      name: z.string().min(2).max(120),
      email: z.string().email().or(z.literal("")).optional(),
      phone: z.string().max(40).optional(),
      title: z.string().max(120).optional(),
    })
    .optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  draftStep: z.number().int().min(1).max(9).optional(),
  logoUrl: z.string().max(300).nullable().optional(),
  status: z.string().optional(),
  loginEmail: z.string().email().optional(),
})

const listInclude = {
  categories: { include: { category: true } },
  contacts: { where: { isPrimary: true }, take: 1 },
  paymentTerm: true,
} satisfies Prisma.VendorInclude

function cleanIban(value?: string | null) {
  if (!value) return null
  const iban = value.replace(/\s+/g, "").toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) {
    throw new ApiError(422, "Enter a valid IBAN.")
  }
  if (iban.startsWith("AE") && iban.length !== 23) {
    throw new ApiError(422, "A UAE IBAN starts with AE and is 23 characters.")
  }
  return iban
}

function oneOf(value: string | null | undefined, allowed: readonly string[], label: string) {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (!allowed.includes(value)) throw new ApiError(422, `${label} is not a supported value.`)
  return value
}

export async function recalcCompliance(vendorId: string) {
  const [vendor, types, docs] = await Promise.all([
    prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { categories: { include: { category: true } } },
    }),
    prisma.documentType.findMany({ where: { active: true, required: true } }),
    prisma.vendorDocument.findMany({ where: { vendorId } }),
  ])
  const required = new Set(types.map((type) => type.slug))
  for (const link of vendor?.categories || []) {
    for (const slug of link.category.requiredDocumentTypes) required.add(slug)
  }
  const typeBySlug = await prisma.documentType.findMany({ where: { slug: { in: [...required] } } })
  const now = new Date()
  const met = typeBySlug.filter((type) =>
    docs.some(
      (doc) =>
        doc.documentTypeId === type.id &&
        doc.status === "APPROVED" &&
        (!doc.expiryDate || doc.expiryDate > now),
    ),
  ).length
  const score = typeBySlug.length === 0 ? (docs.some((doc) => doc.status === "APPROVED") ? 100 : 0) : Math.round((met / typeBySlug.length) * 100)
  await prisma.vendor.update({ where: { id: vendorId }, data: { complianceScore: score } })
  return score
}

export async function saveVendorDetails(vendorId: string, raw: unknown, actorId?: string) {
  const body = vendorSchema.parse(raw)
  const current = await prisma.vendor.findFirst({ where: { id: vendorId, deletedAt: null } })
  if (!current) throw new ApiError(404, "Vendor not found.")
  if (body.tradeLicenseNumber) {
    const duplicate = await prisma.vendor.findFirst({
      where: {
        tradeLicenseNumber: body.tradeLicenseNumber,
        deletedAt: null,
        NOT: { id: vendorId },
      },
    })
    if (duplicate) throw new ApiError(409, "A vendor with this trade license number already exists.")
  }
  const data: Prisma.VendorUpdateInput = {}
  if (body.legalName) data.legalName = body.legalName
  const nullable = [
    "tradeName",
    "tradeLicenseNumber",
    "licenseAuthority",
    "businessActivity",
    "emirate",
    "address",
    "website",
    "trn",
    "corporateTaxInfo",
    "bankName",
    "accountName",
    "logoUrl",
  ] as const
  for (const key of nullable) {
    if (body[key] !== undefined) data[key] = body[key] || null
  }
  if (body.companyType !== undefined) data.companyType = oneOf(body.companyType, COMPANY_TYPES, "Company type") as never
  if (body.zoneType !== undefined) data.zoneType = oneOf(body.zoneType, ZONE_TYPES, "Zone") as never
  if (body.vatStatus !== undefined) data.vatStatus = oneOf(body.vatStatus, VAT_STATUSES, "VAT status") as never
  if (body.licenseIssueDate !== undefined) data.licenseIssueDate = parseDate(body.licenseIssueDate)
  if (body.licenseExpiryDate !== undefined) data.licenseExpiryDate = parseDate(body.licenseExpiryDate)
  if (body.iban !== undefined) data.iban = cleanIban(body.iban)
  if (body.paymentTermId) data.paymentTerm = { connect: { id: body.paymentTermId } }
  else if (body.paymentTermId === null && current.paymentTermId) data.paymentTerm = { disconnect: true }
  if (body.draftStep) data.draftStep = body.draftStep
  if (body.status && VENDOR_STATUSES.includes(body.status) && body.status !== current.status) {
    data.status = body.status as VendorStatus
  }

  const vendor = await prisma.vendor.update({ where: { id: vendorId }, data })

  if (body.categoryIds) {
    await prisma.vendorCategoryLink.deleteMany({ where: { vendorId } })
    if (body.categoryIds.length) {
      await prisma.vendorCategoryLink.createMany({
        data: body.categoryIds.map((categoryId) => ({ vendorId, categoryId })),
        skipDuplicates: true,
      })
    }
  }
  if (body.serviceIds) {
    await prisma.vendorServiceLink.deleteMany({ where: { vendorId } })
    if (body.serviceIds.length) {
      await prisma.vendorServiceLink.createMany({
        data: body.serviceIds.map((serviceId) => ({ vendorId, serviceId })),
        skipDuplicates: true,
      })
    }
  }
  if (body.contact) {
    const existing = await prisma.vendorContact.findFirst({ where: { vendorId, isPrimary: true } })
    if (existing) {
      await prisma.vendorContact.update({
        where: { id: existing.id },
        data: {
          name: body.contact.name,
          email: body.contact.email || null,
          phone: body.contact.phone || null,
          title: body.contact.title || null,
        },
      })
    } else {
      await prisma.vendorContact.create({
        data: { vendorId, name: body.contact.name, email: body.contact.email || null, phone: body.contact.phone, title: body.contact.title, isPrimary: true },
      })
    }
  }
  if (body.customFields) {
    const fields = await prisma.customField.findMany({ where: { key: { in: Object.keys(body.customFields) }, active: true } })
    for (const field of fields) {
      const value = body.customFields[field.key]
      await prisma.customFieldValue.upsert({
        where: { fieldId_vendorId: { fieldId: field.id, vendorId } },
        update: { value: value as Prisma.InputJsonValue },
        create: { fieldId: field.id, vendorId, value: value as Prisma.InputJsonValue },
      })
    }
  }
  if (actorId) {
    await audit({
      userId: actorId,
      action: "Updated vendor",
      module: "vendors",
      recordId: vendor.id,
      recordLabel: vendor.legalName,
      newValue: { status: vendor.status },
    })
  }
  return vendor
}

export async function submitVendor(
  vendorId: string,
  user: PublicUser,
  meta: { ip?: string; userAgent?: string },
  options?: { skipDocumentCheck?: boolean },
) {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, deletedAt: null },
    include: { categories: true, documents: true, customValues: true },
  })
  if (!vendor) throw new ApiError(404, "Vendor not found.")
  if (!["DRAFT", "CHANGES_REQUESTED"].includes(vendor.status)) {
    throw new ApiError(409, "This application has already been submitted.")
  }
  if (vendor.legalName.trim().length < 2) throw new ApiError(422, "Legal company name is required.")
  const tax = await prisma.taxSetting.findUnique({ where: { id: "default" } })
  if (tax?.trnRequired && !vendor.trn) throw new ApiError(422, "TRN is required by the current tax settings.")
  const fields = await prisma.customField.findMany({ where: { active: true, required: true } })
  const categoryIds = vendor.categories.map((item) => item.categoryId)
  for (const field of fields) {
    if (field.categoryIds.length && !field.categoryIds.some((id) => categoryIds.includes(id))) continue
    const value = vendor.customValues.find((item) => item.fieldId === field.id)?.value
    if (value === undefined || value === null || value === "") {
      throw new ApiError(422, `${field.label} is required.`)
    }
  }
  if (!options?.skipDocumentCheck && (await isFeatureEnabled("documents"))) {
    const requiredTypes = await prisma.documentType.findMany({ where: { active: true, required: true } })
    for (const type of requiredTypes) {
      if (!vendor.documents.some((doc) => doc.documentTypeId === type.id)) {
        throw new ApiError(422, `${type.name} is required before submission.`)
      }
    }
  }
  await prisma.vendor.update({
    where: { id: vendorId },
    data: { status: "SUBMITTED", submittedAt: new Date(), draftStep: 9 },
  })
  if (await isFeatureEnabled("vendorApproval")) {
    const categoryId = vendor.categories[0]?.categoryId
    const specific = categoryId
      ? await prisma.approvalWorkflow.findFirst({
          where: { module: "vendor_registration", categoryId, active: true },
        })
      : null
    const workflow =
      specific ||
      (await prisma.approvalWorkflow.findFirst({
        where: { module: "vendor_registration", categoryId: null, active: true },
      }))
    if (workflow) {
      await prisma.approvalRequest.create({
        data: {
          workflowId: workflow.id,
          vendorId,
          entityType: "vendor",
          entityId: vendorId,
          status: "PENDING",
          currentStep: 0,
        },
      })
    }
  }
  await prisma.vendorFieldReview.updateMany({
    where: { vendorId, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  })
  await prisma.vendorApplication.create({
    data: { vendorId, status: "SUBMITTED", submittedAt: new Date() },
  })
  await audit({
    userId: user.id,
    action: "Submitted vendor application",
    module: "vendors",
    recordId: vendorId,
    recordLabel: vendor.legalName,
    ...meta,
  })
  return prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } })
}

export async function listVendors(req: Request) {
  const user = await authorize({ module: "vendors", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const ownId = scopeVendor(user, query.vendorId)
  const where: Prisma.VendorWhereInput = {
    deletedAt: null,
    ...businessScope(user),
    ...(ownId ? { id: ownId } : {}),
    ...(query.status ? { status: query.status as VendorStatus } : {}),
    ...(query.category ? { categories: { some: { categoryId: query.category } } } : {}),
    ...(query.q
      ? {
          OR: ["legalName", "tradeName", "vendorCode", "tradeLicenseNumber", "emirate"].map((field) => ({
            [field]: { contains: query.q, mode: "insensitive" },
          })),
        }
      : {}),
  }
  const sort = allowedSort(query.sort, ["legalName", "vendorCode", "status", "createdAt", "complianceScore", "emirate"] as const, "createdAt")
  const [total, rows] = await Promise.all([
    prisma.vendor.count({ where }),
    prisma.vendor.findMany({
      where,
      include: listInclude,
      orderBy: { [sort]: query.dir },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Vendors loaded.", metaOf(total, query.page, query.pageSize))
}

export async function getVendor(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "vendors", action: "VIEW" })
  scopeVendor(user, params.id)
  const vendor = await prisma.vendor.findFirst({
    where: { id: params.id, deletedAt: null, ...businessScope(user) },
    include: {
      contacts: true,
      categories: { include: { category: true } },
      services: { include: { service: true } },
      documents: { include: { documentType: true, fileAsset: true }, orderBy: { createdAt: "desc" } },
      paymentTerm: true,
      customValues: { include: { field: true } },
      notes: {
        where: user.portal === "VENDOR" ? { internal: false } : {},
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      approvalRequests: {
        include: {
          workflow: { include: { steps: { orderBy: { sortOrder: "asc" } } } },
          actions: { include: { actor: { select: { name: true } }, step: true }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      },
      performances: { orderBy: { createdAt: "desc" }, take: 12 },
      fieldReviews: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" } },
      _count: {
        select: { events: true, quotations: true, purchaseOrders: true, invoices: true, tasks: true, contracts: true, deliveries: true },
      },
    },
  })
  if (!vendor) throw new ApiError(404, "Vendor not found.")
  return ok(toPlain(vendor), "Vendor loaded.")
}

export async function openVendorAccess(vendorId: string, input: { email: string; name?: string; phone?: string }, origin: string) {
  const email = input.email.toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new ApiError(409, "An account with this email already exists.")
  const role = await prisma.role.findUnique({ where: { slug: "vendor" } })
  const password = `Aa1${randomBytes(6).toString("base64url")}`
  const name = input.name?.trim() || email
  const vendorOrg = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { organizationId: true } })
  const identityUserId = await provisionIdentity(email, password)
  const account = await prisma.user.create({
    data: {
      name,
      email,
      phone: input.phone,
      passwordHash: managedPassword(),
      identityUserId,
      organizationId: vendorOrg?.organizationId,
      portal: "VENDOR",
      roleId: role?.id,
      vendorId,
      mustChangePassword: true,
      status: "ACTIVE",
    },
  })
  const contact = await prisma.vendorContact.findFirst({ where: { vendorId, isPrimary: true } })
  if (!contact) {
    await prisma.vendorContact.create({ data: { vendorId, name, email, phone: input.phone, isPrimary: true } })
  }
  const company = await prisma.companySetting.findUnique({ where: { id: "default" } })
  const emailed = await sendMail({
    to: email,
    subject: `${company?.companyName || "Vendor desk"} sign-in`,
    text: `A vendor account has been created for you.\n\nSign in: ${origin}/login\nEmail: ${email}\nTemporary password: ${password}\n\nYou will be asked to choose a new password the first time you sign in. After that, complete the company details your administrator requires and submit them for verification.`,
  })
  return { id: account.id, email, emailed, temporaryPassword: emailed ? undefined : password }
}

export async function createVendor(req: Request) {
  const user = await authorize({ module: "vendors", action: "CREATE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = vendorSchema.parse(await readJson(req))
  const legalName = body.legalName || body.loginEmail
  if (!legalName) throw new ApiError(422, "Enter a login email. Company details can be completed by the vendor.")
  const vendor = await prisma.vendor.create({
    data: {
      vendorCode: await nextCode("vendor", "V"),
      legalName,
      status: "DRAFT",
      organizationId: user.organizationId,
    },
  })
  await saveVendorDetails(vendor.id, { ...body, legalName }, user.id)
  const access = body.loginEmail ? await openVendorAccess(vendor.id, { email: body.loginEmail, name: body.contact?.name || legalName, phone: body.contact?.phone }, requestOrigin(req)) : null
  const meta = clientMeta(req)
  await audit({ userId: user.id, action: "Created vendor", module: "vendors", recordId: vendor.id, recordLabel: legalName, ...meta })
  const message = access?.emailed
    ? "Vendor created. A sign-in email with a temporary password was sent."
    : access
      ? "Vendor created. Mail is not configured, so share the temporary password shown here."
      : "Vendor created."
  return ok(toPlain({ ...(await prisma.vendor.findUnique({ where: { id: vendor.id }, include: listInclude })), notice: message, temporaryPassword: access?.temporaryPassword, emailed: access?.emailed ?? false }), message, undefined, 201)
}

export async function updateVendor(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "vendors", action: "EDIT" })
  scopeVendor(user, params.id)
  const body = vendorSchema.parse(await readJson(req))
  if (user.portal === "VENDOR") {
    const current = await prisma.vendor.findUnique({ where: { id: params.id } })
    if (!current || !["DRAFT", "CHANGES_REQUESTED"].includes(current.status)) {
      throw new ApiError(409, "Approved vendor profiles are updated through a change request.")
    }
    delete body.status
  } else if (body.status && !can(user, "vendors", "APPROVE")) {
    delete body.status
  }
  const saved = await saveVendorDetails(params.id, body, user.id)
  return ok(toPlain(saved), "Vendor updated.")
}

export async function deleteVendor(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "vendors", action: "DELETE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const vendor = await prisma.vendor.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), status: "ARCHIVED" },
  })
  await audit({ userId: user.id, action: "Archived vendor", module: "vendors", recordId: vendor.id, recordLabel: vendor.legalName, ...clientMeta(req) })
  return ok({ id: vendor.id }, "Vendor archived.")
}

export async function reviewVendor(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "vendors", action: "APPROVE", portals: ["SUPER_ADMIN", "ADMIN"], feature: "vendorVerification" })
  const body = z
    .object({
      action: z.enum(["APPROVE", "REJECT", "CHANGES", "ACTIVATE", "SUSPEND"]),
      note: z.string().max(2000).optional(),
    })
    .parse(await readJson(req))
  const vendor = await prisma.vendor.findFirst({ where: { id: params.id, deletedAt: null, ...businessScope(user) } })
  if (!vendor) throw new ApiError(404, "Vendor not found.")
  assertSameOrg(user, vendor.organizationId)
  const meta = clientMeta(req)
  let status: VendorStatus = vendor.status
  let message = "Vendor updated."

  if (body.action === "ACTIVATE") {
    status = "ACTIVE"
    message = "Vendor activated."
  } else if (body.action === "SUSPEND") {
    status = "SUSPENDED"
    message = "Vendor suspended."
  } else if (body.action === "REJECT") {
    status = "REJECTED"
    message = "Vendor rejected."
  } else if (body.action === "CHANGES") {
    status = "CHANGES_REQUESTED"
    message = "Changes requested."
  } else if (await isFeatureEnabled("vendorApproval")) {
    const request = await prisma.approvalRequest.findFirst({
      where: { vendorId: vendor.id, entityType: "vendor", status: { in: ["PENDING", "CHANGES_REQUESTED"] } },
      include: { workflow: { include: { steps: { orderBy: { sortOrder: "asc" } } } } },
      orderBy: { createdAt: "desc" },
    })
    if (!request) {
      status = "APPROVED"
    } else {
      const step = request.workflow.steps[request.currentStep]
      if (step?.roleSlug && user.role?.slug !== step.roleSlug && user.portal !== "SUPER_ADMIN") {
        throw new ApiError(403, `This step is assigned to the ${step.roleSlug} role.`)
      }
      await prisma.approvalAction.create({
        data: {
          requestId: request.id,
          stepId: step?.id,
          actorId: user.id,
          action: "APPROVED",
          note: body.note,
        },
      })
      const next = request.currentStep + 1
      if (next >= request.workflow.steps.length) {
        await prisma.approvalRequest.update({ where: { id: request.id }, data: { status: "APPROVED", currentStep: next } })
        status = "APPROVED"
        message = "Vendor approved."
      } else {
        await prisma.approvalRequest.update({ where: { id: request.id }, data: { status: "PENDING", currentStep: next } })
        status = "UNDER_REVIEW"
        message = `Moved to ${request.workflow.steps[next]?.name || "the next step"}.`
      }
    }
  } else {
    status = "APPROVED"
    message = "Vendor approved."
  }

  if (body.action === "REJECT" || body.action === "CHANGES") {
    const request = await prisma.approvalRequest.findFirst({
      where: { vendorId: vendor.id, entityType: "vendor", status: { in: ["PENDING", "CHANGES_REQUESTED"] } },
      orderBy: { createdAt: "desc" },
    })
    if (request) {
      await prisma.approvalRequest.update({
        where: { id: request.id },
        data: { status: body.action === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED" },
      })
      await prisma.approvalAction.create({
        data: {
          requestId: request.id,
          actorId: user.id,
          action: body.action === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED",
          note: body.note,
        },
      })
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.vendor.update({
      where: { id: vendor.id },
      data: {
        status,
        approvedAt: status === "APPROVED" || status === "ACTIVE" ? vendor.approvedAt || new Date() : vendor.approvedAt,
      },
    })
    if (body.note) {
      await tx.note.create({
        data: { vendorId: vendor.id, authorId: user.id, body: body.note, internal: true },
      })
    }
    if (body.action === "APPROVE" && status === "APPROVED") {
      await publishEvent({
        eventType: "VendorApproved",
        aggregateType: "Vendor",
        aggregateId: vendor.id,
        payload: { vendorId: vendor.id, approvedBy: user.id, note: body.note || "" },
      }, tx)
    }
    if (body.action === "REJECT") {
      await publishEvent({
        eventType: "VendorRejected",
        aggregateType: "Vendor",
        aggregateId: vendor.id,
        payload: { vendorId: vendor.id, rejectedBy: user.id, note: body.note || "" },
      }, tx)
    }
    return row
  })
  const template =
    body.action === "REJECT" ? "rejection" : body.action === "CHANGES" ? "changes_requested" : body.action === "APPROVE" && status === "APPROVED" ? "approval" : null
  if (template) {
    await notifyVendorUsers(vendor.id, template, { vendor: vendor.legalName, actor: user.name, note: body.note || "" }, "/vendor")
    await notifyStaff(template, { vendor: vendor.legalName, actor: user.name, note: body.note || "" }, `/admin/vendors/${vendor.id}`)
  }
  await audit({
    userId: user.id,
    action: message,
    module: "vendors",
    recordId: vendor.id,
    recordLabel: vendor.legalName,
    oldValue: { status: vendor.status },
    newValue: { status, note: body.note },
    ...meta,
  })
  return ok(toPlain(updated), message)
}

export async function flagVendorField(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "vendors", action: "EDIT", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z.object({ fieldKey: z.string().min(1).max(80), label: z.string().min(1).max(120), note: z.string().min(3).max(2000) }).parse(await readJson(req))
  const vendor = await prisma.vendor.findFirst({ where: { id: params.id, deletedAt: null }, include: { users: { where: { deletedAt: null }, select: { email: true, name: true } } } })
  if (!vendor) throw new ApiError(404, "Vendor not found.")
  const review = await prisma.vendorFieldReview.create({
    data: { vendorId: vendor.id, fieldKey: body.fieldKey, label: body.label, note: body.note, authorId: user.id },
  })
  await prisma.vendor.update({ where: { id: vendor.id }, data: { status: "CHANGES_REQUESTED" } })
  await notifyVendorUsers(vendor.id, "changes_requested", { vendor: vendor.legalName, actor: user.name, note: `${body.label}: ${body.note}` }, "/vendor")
  const origin = requestOrigin(req)
  for (const account of vendor.users) {
    await sendMail({
      to: account.email,
      subject: `Update requested: ${body.label}`,
      text: `${user.name} asked you to update ${body.label}.\n\nNote: ${body.note}\n\nSign in, update the field, and submit the profile again for verification.\n${origin}/login`,
    })
  }
  await audit({ userId: user.id, action: "Requested a vendor field update", module: "vendors", recordId: vendor.id, recordLabel: body.label, newValue: { note: body.note }, ...clientMeta(req) })
  return ok(review, "The vendor can see this note on the dashboard and in email.", undefined, 201)
}

export async function addVendorNote(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "vendors", action: "EDIT", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z.object({ body: z.string().min(1).max(4000), internal: z.boolean().optional() }).parse(await readJson(req))
  const note = await prisma.note.create({
    data: { vendorId: params.id, authorId: user.id, body: body.body, internal: body.internal ?? true },
  })
  await audit({ userId: user.id, action: "Added vendor note", module: "vendors", recordId: params.id, recordLabel: body.body.slice(0, 80), ...clientMeta(req) })
  return ok(note, "Note added.", undefined, 201)
}

export async function vendorActivity(_req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "vendors", action: "VIEW" })
  scopeVendor(user, params.id)
  const logs = await prisma.auditLog.findMany({
    where: { recordId: params.id },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
  return ok(toPlain(logs), "Activity loaded.")
}

export async function inviteVendor(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "vendors", action: "CREATE", portals: ["ADMIN"] })
  const body = z.object({ name: z.string().min(2), email: z.string().email(), phone: z.string().optional() }).parse(await readJson(req))
  const vendor = await prisma.vendor.findFirst({ where: { id: params.id, deletedAt: null, ...businessScope(user) } })
  if (!vendor) throw new ApiError(404, "Vendor not found.")
  const role = await prisma.role.findUnique({ where: { slug: "vendor" } })
  const password = `Aa1${randomBytes(6).toString("base64url")}`
  const identityUserId = await provisionIdentity(body.email, password)
  const account = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase(),
      phone: body.phone,
      passwordHash: managedPassword(),
      identityUserId,
      organizationId: vendor.organizationId,
      portal: "VENDOR",
      roleId: role?.id,
      vendorId: vendor.id,
      status: "ACTIVE",
    },
  })
  await audit({ userId: user.id, action: "Invited vendor user", module: "users", recordId: account.id, recordLabel: account.email, ...clientMeta(req) })
  return ok({ id: account.id, email: account.email, temporaryPassword: password }, "Vendor user created. Share the temporary password through your own channel. It is not stored in plain text.", undefined, 201)
}

export async function listApplications(req: Request) {
  const user = await authorize({ module: "vendors", action: "VIEW", portals: ["ADMIN"] })
  const query = listQuery(new URL(req.url))
  const where: Prisma.VendorWhereInput = {
    deletedAt: null,
    ...businessScope(user),
    status: query.status ? (query.status as VendorStatus) : { in: ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"] },
    ...(query.q ? { legalName: { contains: query.q, mode: "insensitive" } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.vendor.count({ where }),
    prisma.vendor.findMany({
      where,
      include: listInclude,
      orderBy: { submittedAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Applications loaded.", metaOf(total, query.page, query.pageSize))
}
