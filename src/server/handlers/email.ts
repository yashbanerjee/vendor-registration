import { z } from "zod"
import { prisma } from "@/server/db"
import { encryptSecret } from "@/server/crypto"
import { ApiError } from "@/server/errors"
import { fillTemplate, verifyWebhook } from "@/server/email/compose"
import { recordEmailEvent } from "@/server/email/process"
import { queueEmail } from "@/server/email/queue-mail"
import { emailPolicy, emailRuntimeConfig } from "@/server/email/settings"
import { authorize } from "@/server/guard"
import { clientMeta, ok, readJson } from "@/server/http"
import { audit } from "@/server/audit"
import { isFeatureEnabled } from "@/server/guard"

async function emailAdmin(action: "VIEW" | "CREATE" | "EDIT") {
  const user = await authorize({ module: "notifications", action, portals: ["SUPER_ADMIN", "ADMIN"], feature: "bulkEmail" })
  if (user.role?.slug === "staff") throw new ApiError(403, "Email administration is limited to administrators.")
  return user
}

const filtersSchema = z.object({
  status: z.string().optional(),
  emirate: z.string().optional(),
  categoryId: z.string().optional(),
  eventId: z.string().optional(),
  complianceBelow: z.number().optional(),
}).default({})

export async function listCampaigns(req: Request) {
  await emailAdmin("VIEW")
  const url = new URL(req.url)
  const page = Number(url.searchParams.get("page") || 1)
  const pageSize = Math.min(50, Number(url.searchParams.get("pageSize") || 20))
  const q = url.searchParams.get("q") || ""
  const where = q ? { name: { contains: q, mode: "insensitive" as const } } : {}
  const [total, rows] = await Promise.all([
    prisma.emailCampaign.count({ where }),
    prisma.emailCampaign.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { messages: true } } } }),
  ])
  return ok(rows, "Campaigns loaded.", { page, pageSize, total })
}

export async function createCampaign(req: Request) {
  const user = await emailAdmin("CREATE")
  const body = z.object({
    name: z.string().min(2).max(160),
    subject: z.string().min(2).max(200),
    templateId: z.string().optional(),
    bodyText: z.string().max(20000).optional(),
    bodyHtml: z.string().max(50000).optional(),
    category: z.enum(["marketing", "transactional"]).default("marketing"),
    scheduleAt: z.string().datetime().optional(),
    filters: filtersSchema,
    previewOnly: z.boolean().optional(),
  }).parse(await readJson(req))
  const recipients = await resolveRecipients(body.filters)
  if (body.previewOnly) return ok({ count: recipients.length, sample: recipients.slice(0, 5).map((item) => item.email) }, "Recipient preview ready.")
  const campaign = await prisma.emailCampaign.create({
    data: {
      name: body.name,
      subject: body.subject,
      templateId: body.templateId,
      bodyText: body.bodyText,
      bodyHtml: body.bodyHtml,
      filters: body.filters,
      category: body.category,
      scheduleAt: body.scheduleAt ? new Date(body.scheduleAt) : null,
      status: "QUEUED",
      createdById: user.id,
    },
  })
  const template = body.templateId ? await prisma.emailTemplate.findUnique({ where: { id: body.templateId } }) : null
  const runAt = body.scheduleAt ? new Date(body.scheduleAt) : new Date()
  for (const recipient of recipients) {
    const vars = { vendorName: recipient.name, companyName: recipient.company, vendorId: recipient.vendorId, portalUrl: "" }
    const subject = fillTemplate(template?.subject || body.subject, vars)
    const text = fillTemplate(template?.text || body.bodyText || body.subject, vars)
    const html = fillTemplate(template?.html || body.bodyHtml || "", vars)
    await queueEmail({
      to: recipient.email,
      name: recipient.name,
      subject,
      text,
      html: html || undefined,
      category: body.category,
      campaignId: campaign.id,
      templateId: template?.id,
      vendorId: recipient.vendorId,
      idempotencyKey: `${campaign.id}:${recipient.email}`,
      runAt,
    }).catch(() => undefined)
  }
  await audit({ userId: user.id, action: "Queued email campaign", module: "notifications", recordId: campaign.id, recordLabel: campaign.name, newValue: { recipients: recipients.length }, ...clientMeta(req) })
  return ok({ id: campaign.id, recipients: recipients.length }, "Campaign queued.", undefined, 201)
}

async function resolveRecipients(filters: z.infer<typeof filtersSchema>) {
  const vendors = await prisma.vendor.findMany({
    where: {
      deletedAt: null,
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.emirate ? { emirate: filters.emirate } : {}),
      ...(filters.complianceBelow != null ? { complianceScore: { lt: filters.complianceBelow } } : {}),
      ...(filters.categoryId ? { categories: { some: { categoryId: filters.categoryId } } } : {}),
      ...(filters.eventId ? { events: { some: { eventId: filters.eventId } } } : {}),
    },
    select: { id: true, legalName: true, users: { where: { deletedAt: null }, select: { email: true, name: true } }, contacts: { where: { isPrimary: true }, select: { email: true, name: true } } },
    take: 100000,
  })
  const rows: { email: string; name: string; company: string; vendorId: string }[] = []
  const seen = new Set<string>()
  for (const vendor of vendors) {
    const account = vendor.users[0]
    const contact = vendor.contacts[0]
    const email = (account?.email || contact?.email || "").toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    rows.push({ email, name: account?.name || contact?.name || vendor.legalName, company: vendor.legalName, vendorId: vendor.id })
  }
  return rows
}

export async function getCampaign(_req: Request, params: Record<string, string>) {
  await emailAdmin("VIEW")
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: params.id }, include: { template: true } })
  if (!campaign) throw new ApiError(404, "Campaign not found.")
  const grouped = await prisma.emailMessage.groupBy({ by: ["status"], where: { campaignId: campaign.id }, _count: { _all: true } })
  const counts = Object.fromEntries(grouped.map((row) => [row.status, row._count._all]))
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  const delivered = counts.DELIVERED || 0
  const opened = (counts.OPENED || 0) + (counts.CLICKED || 0)
  const sent = total - (counts.QUEUED || 0) - (counts.PROCESSING || 0) - (counts.DRAFT || 0) - (counts.CANCELLED || 0)
  return ok({
    campaign,
    counts,
    total,
    rates: {
      delivery: sent ? Math.round((delivered / sent) * 100) : 0,
      open: sent ? Math.round((opened / sent) * 100) : 0,
      click: sent ? Math.round(((counts.CLICKED || 0) / sent) * 100) : 0,
      bounce: sent ? Math.round((((counts.BOUNCED || 0) + (counts.SOFT_BOUNCED || 0) + (counts.HARD_BOUNCED || 0)) / sent) * 100) : 0,
      complaint: sent ? Math.round(((counts.COMPLAINED || 0) / sent) * 100) : 0,
    },
    note: "Opened means an open-tracking event was detected. It is not proof that a person read the email.",
  }, "Campaign loaded.")
}

export async function listMessages(req: Request) {
  await emailAdmin("VIEW")
  const url = new URL(req.url)
  const q = url.searchParams.get("q") || ""
  const campaignId = url.searchParams.get("campaignId") || undefined
  const status = url.searchParams.get("status") || undefined
  const page = Number(url.searchParams.get("page") || 1)
  const pageSize = Math.min(50, Number(url.searchParams.get("pageSize") || 20))
  const where = {
    ...(campaignId ? { campaignId } : {}),
    ...(status ? { status } : {}),
    ...(q ? { recipientEmail: { contains: q, mode: "insensitive" as const } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.emailMessage.count({ where }),
    prisma.emailMessage.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, recipientEmail: true, recipientName: true, subject: true, status: true, campaignId: true, sentAt: true, deliveredAt: true, openedAt: true, openCount: true, clickCount: true, createdAt: true } }),
  ])
  return ok(rows, "Messages loaded.", { page, pageSize, total })
}

export async function getMessage(_req: Request, params: Record<string, string>) {
  await emailAdmin("VIEW")
  const message = await prisma.emailMessage.findUnique({ where: { id: params.id }, include: { events: { orderBy: { timestamp: "asc" } }, campaign: { select: { name: true } } } })
  if (!message) throw new ApiError(404, "Email not found.")
  return ok({ ...message, note: "Opened means a tracking event was detected, not that the message was definitely read." }, "Email loaded.")
}

export async function listTemplates() {
  await emailAdmin("VIEW")
  const rows = await prisma.emailTemplate.findMany({ orderBy: { name: "asc" } })
  return ok(rows, "Templates loaded.")
}

export async function saveTemplate(req: Request, params: Record<string, string>) {
  const user = await emailAdmin("EDIT")
  const body = z.object({
    key: z.string().min(2).max(80),
    name: z.string().min(2).max(120),
    category: z.enum(["transactional", "marketing"]),
    subject: z.string().min(1).max(200),
    text: z.string().min(1).max(20000),
    html: z.string().max(50000).default(""),
    active: z.boolean().optional(),
  }).parse(await readJson(req))
  const row = params.id
    ? await prisma.emailTemplate.update({ where: { id: params.id }, data: body })
    : await prisma.emailTemplate.upsert({ where: { key: body.key }, update: body, create: { ...body, active: body.active ?? true } })
  await audit({ userId: user.id, action: "Saved email template", module: "notifications", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(row, "Template saved.")
}

export async function previewTemplate(req: Request) {
  await emailAdmin("VIEW")
  const body = z.object({ subject: z.string(), text: z.string(), html: z.string().optional(), vars: z.record(z.string(), z.string()).default({}) }).parse(await readJson(req))
  const sample = { vendorName: "Gulf Horizon Supplies", companyName: "Vedha Technologies", vendorId: "V-2026-0001", eventName: "Sample event", rfqNumber: "RFQ-2026-0001", poNumber: "PO-2026-0001", invoiceNumber: "INV-2026-0001", amount: "AED 1,000.00", dueDate: "2026-10-01", portalUrl: "/login", ...body.vars }
  return ok({ subject: fillTemplate(body.subject, sample), text: fillTemplate(body.text, sample), html: fillTemplate(body.html || "", sample) }, "Preview ready.")
}

export async function listSuppressions() {
  await emailAdmin("VIEW")
  const [suppressed, unsubscribed] = await Promise.all([
    prisma.emailSuppression.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.emailUnsubscribe.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
  ])
  return ok({ suppressed, unsubscribed }, "Suppression list loaded.")
}

export async function deleteSuppression(req: Request, params: Record<string, string>) {
  const user = await emailAdmin("EDIT")
  await prisma.emailSuppression.delete({ where: { id: params.id } })
  await audit({ userId: user.id, action: "Removed email suppression", module: "notifications", recordId: params.id, ...clientMeta(req) })
  return ok({ id: params.id }, "Suppression removed.")
}

export async function getEmailSettings() {
  await authorize({ module: "settings", action: "VIEW", portals: ["SUPER_ADMIN", "ADMIN"] })
  const runtime = await emailRuntimeConfig()
  return ok({
    ...runtime.policy,
    smtpConfigured: Boolean(runtime.smtp),
    providerSecretSet: Boolean(runtime.providerSecret),
    redisConfigured: Boolean(runtime.redisUrl),
    webhookSecretSet: Boolean(runtime.webhookSecret),
  }, "Email settings loaded.")
}

export async function saveEmailSettings(req: Request) {
  const user = await authorize({ module: "settings", action: "EDIT", portals: ["SUPER_ADMIN"] })
  const body = z.object({
    provider: z.enum(["smtp", "ses", "sendgrid", "mailgun", "postmark", "resend"]),
    senderName: z.string().max(120).optional(),
    senderEmail: z.string().email().optional().or(z.literal("")),
    replyTo: z.string().email().optional().or(z.literal("")),
    publicBaseUrl: z.string().max(300).optional(),
    dailyLimit: z.number().int().min(1).max(1000000),
    perSecond: z.number().int().min(1).max(1000),
    perMinute: z.number().int().min(1).max(100000),
    perHour: z.number().int().min(1).max(1000000),
    batchSize: z.number().int().min(1).max(500),
    maxRetries: z.number().int().min(0).max(10),
    initialDelayMs: z.number().int().min(1000).max(86_400_000),
    maxDelayMs: z.number().int().min(1000).max(86_400_000),
    trackingEnabled: z.boolean(),
    openTracking: z.boolean(),
    clickTracking: z.boolean(),
    bounceProcessing: z.boolean(),
    complaintProcessing: z.boolean(),
    unsubscribeEnabled: z.boolean(),
    apiKey: z.string().min(8).optional(),
    mailgunDomain: z.string().optional(),
    redisUrl: z.string().optional(),
    webhookSecret: z.string().min(16).optional(),
  }).parse(await readJson(req))
  const { apiKey, mailgunDomain, redisUrl, webhookSecret, ...policy } = body
  await prisma.systemSetting.upsert({ where: { key: "email.policy" }, update: { value: policy, group: "email" }, create: { key: "email.policy", value: policy, group: "email" } })
  if (apiKey) {
    await prisma.integrationSetting.upsert({
      where: { provider: `email:${body.provider}` },
      update: { enabled: true, secretCipher: await encryptSecret(apiKey), config: { domain: mailgunDomain || "" } },
      create: { provider: `email:${body.provider}`, enabled: true, secretCipher: await encryptSecret(apiKey), config: { domain: mailgunDomain || "" } },
    })
  }
  if (redisUrl) {
    await prisma.integrationSetting.upsert({
      where: { provider: "redis" },
      update: { enabled: true, secretCipher: await encryptSecret(redisUrl), config: {} },
      create: { provider: "redis", enabled: true, secretCipher: await encryptSecret(redisUrl), config: {} },
    })
  }
  if (webhookSecret) {
    await prisma.integrationSetting.upsert({
      where: { provider: "email-webhook" },
      update: { enabled: true, secretCipher: await encryptSecret(webhookSecret), config: {} },
      create: { provider: "email-webhook", enabled: true, secretCipher: await encryptSecret(webhookSecret), config: {} },
    })
  }
  await audit({ userId: user.id, action: "Updated email settings", module: "settings", recordLabel: body.provider, ...clientMeta(req) })
  return ok({ saved: true }, "Email settings saved. Secrets are stored encrypted and are not shown again.")
}

export async function receiveWebhook(req: Request, params: Record<string, string>) {
  if (!(await isFeatureEnabled("deliveryTracking")) && !(await isFeatureEnabled("bounceProcessing"))) {
    throw new ApiError(404, "Email webhooks are turned off.")
  }
  const provider = params.provider
  const raw = await req.text()
  const runtime = await emailRuntimeConfig()
  const signature = req.headers.get("x-email-signature") || req.headers.get("x-twilio-email-event-webhook-signature")
  const verified = verifyWebhook(runtime.webhookSecret, raw, signature)
  if (!verified) throw new ApiError(401, "Webhook signature was rejected.")
  let payload: { eventId?: string; messageId?: string; providerMessageId?: string; event?: string; reason?: string; timestamp?: string }
  try {
    payload = JSON.parse(raw)
  } catch {
    throw new ApiError(422, "Webhook payload must be JSON.")
  }
  const eventId = payload.eventId || ""
  if (!eventId) throw new ApiError(422, "provider event id is required.")
  const duplicate = await prisma.emailWebhookEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: eventId } } })
  if (duplicate) return ok({ duplicate: true }, "Event already stored.")
  await prisma.emailWebhookEvent.create({ data: { provider, providerEventId: eventId, payload, verified: true } })
  const message = payload.messageId
    ? await prisma.emailMessage.findUnique({ where: { id: payload.messageId } })
    : payload.providerMessageId
      ? await prisma.emailMessage.findFirst({ where: { providerMessageId: payload.providerMessageId } })
      : null
  if (!message) return ok({ stored: true }, "Event stored.")
  const map: Record<string, { type: string; status?: string; bounceType?: string }> = {
    delivered: { type: "delivered", status: "DELIVERED" },
    open: { type: "open", status: "OPENED" },
    click: { type: "click", status: "CLICKED" },
    bounce: { type: "bounce", status: "BOUNCED" },
    soft_bounce: { type: "soft_bounce", status: "SOFT_BOUNCED", bounceType: "soft" },
    hard_bounce: { type: "hard_bounce", status: "HARD_BOUNCED", bounceType: "hard" },
    complaint: { type: "complaint", status: "COMPLAINED" },
    unsubscribe: { type: "unsubscribe", status: "UNSUBSCRIBED" },
    failed: { type: "failed", status: "FAILED" },
    deferred: { type: "deferred", status: "DEFERRED" },
  }
  const mapped = map[payload.event || ""]
  if (!mapped) return ok({ stored: true }, "Event stored.")
  if (mapped.type === "complaint" && !(await isFeatureEnabled("complaintProcessing"))) return ok({ stored: true }, "Complaint processing is off.")
  if ((mapped.bounceType || mapped.type === "bounce") && !(await isFeatureEnabled("bounceProcessing"))) return ok({ stored: true }, "Bounce processing is off.")
  await recordEmailEvent({
    messageId: message.id,
    eventType: mapped.type,
    status: mapped.status,
    providerEventId: `${provider}:${eventId}`,
    providerMessageId: payload.providerMessageId,
    timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    bounceType: mapped.bounceType,
    bounceReason: payload.reason,
    metadata: { provider },
  })
  if (mapped.type === "unsubscribe") {
    await prisma.emailUnsubscribe.upsert({
      where: { email_category: { email: message.recipientEmail, category: "marketing" } },
      update: {},
      create: { email: message.recipientEmail, category: "marketing" },
    })
  }
  return ok({ stored: true }, "Event applied.")
}
