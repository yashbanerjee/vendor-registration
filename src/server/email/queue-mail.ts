import { randomUUID } from "crypto"
import { prisma } from "@/server/db"
import { trackingToken } from "@/server/email/compose"
import { emailPolicy } from "@/server/email/settings"
import { publishEvent } from "@/server/events/outbox"
import { isFeatureEnabled } from "@/server/guard"
import { enqueue } from "@/server/queue"

export async function queueEmail(input: {
  to: string
  name?: string
  subject: string
  text: string
  html?: string
  category?: "transactional" | "marketing"
  campaignId?: string
  templateId?: string
  vendorId?: string
  idempotencyKey?: string
  runAt?: Date
}) {
  if (!(await isFeatureEnabled("emailQueue"))) return null
  const policy = await emailPolicy()
  const email = input.to.toLowerCase()
  const message = await prisma.emailMessage.create({
    data: {
      campaignId: input.campaignId,
      templateId: input.templateId,
      recipientEmail: email,
      recipientName: input.name,
      vendorId: input.vendorId,
      subject: input.subject,
      textBody: input.text,
      htmlBody: input.html,
      status: "QUEUED",
      trackingToken: trackingToken(),
      category: input.category || "transactional",
      queuedAt: new Date(),
      idempotencyKey: input.idempotencyKey,
    },
  })
  await publishEvent({
    eventType: "EmailQueued",
    aggregateType: "EmailMessage",
    aggregateId: message.id,
    payload: { messageId: message.id, campaignId: input.campaignId || null },
  })
  await enqueue({
    queue: "email",
    name: "send",
    payload: { messageId: message.id },
    runAt: input.runAt,
    maxAttempts: policy.maxRetries,
    idempotencyKey: input.idempotencyKey ? `email-job:${input.idempotencyKey}` : `email-job:${message.id}`,
    priority: input.category === "transactional" ? 10 : 0,
  })
  await recordQueued(message.id)
  return message
}

async function recordQueued(messageId: string) {
  await prisma.emailEvent.create({
    data: { emailMessageId: messageId, eventType: "queued", timestamp: new Date(), providerEventId: `queued:${messageId}:${randomUUID()}` },
  })
}

export async function providerConfigured() {
  const policy = await emailPolicy()
  if (policy.provider === "smtp") {
    const row = await prisma.integrationSetting.findUnique({ where: { provider: "smtp" } })
    const config = (row?.config || {}) as { host?: string; from?: string }
    return Boolean(row?.enabled && row.secretCipher && config.host && (config.from || policy.senderEmail))
  }
  const row = await prisma.integrationSetting.findUnique({ where: { provider: `email:${policy.provider}` } })
  return Boolean(row?.enabled && row.secretCipher && policy.senderEmail)
}
