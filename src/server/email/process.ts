import type { Prisma } from "@prisma/client"
import { prisma } from "@/server/db"
import { isFeatureEnabled } from "@/server/guard"
import { applyTracking, fillTemplate } from "@/server/email/compose"
import { sendWithProvider } from "@/server/email/provider"
import { backoffMs, emailRuntimeConfig } from "@/server/email/settings"
import type { ClaimedJob } from "@/server/queue/types"
import { completeJob, failJob } from "@/server/queue/postgres"

const forwardRank: Record<string, number> = {
  DRAFT: 0,
  QUEUED: 1,
  PROCESSING: 2,
  DEFERRED: 3,
  SENT: 4,
  DELIVERED: 5,
  OPENED: 6,
  CLICKED: 7,
  SOFT_BOUNCED: 8,
  BOUNCED: 8,
  HARD_BOUNCED: 9,
  COMPLAINED: 9,
  UNSUBSCRIBED: 9,
  FAILED: 9,
  CANCELLED: 10,
}

export function canAdvance(current: string, next: string) {
  return (forwardRank[next] ?? 0) >= (forwardRank[current] ?? 0)
}

export async function recordEmailEvent(input: {
  messageId: string
  eventType: string
  status?: string
  providerEventId?: string
  providerMessageId?: string
  timestamp?: Date
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  bounceType?: string
  bounceReason?: string
}) {
  if (input.providerEventId) {
    const existing = await prisma.emailEvent.findUnique({ where: { providerEventId: input.providerEventId } })
    if (existing) return existing
  }
  const message = await prisma.emailMessage.findUnique({ where: { id: input.messageId } })
  if (!message) return null
  const timestamp = input.timestamp || new Date()
  const event = await prisma.emailEvent.create({
    data: {
      emailMessageId: message.id,
      eventType: input.eventType,
      providerEventId: input.providerEventId,
      providerMessageId: input.providerMessageId || message.providerMessageId,
      timestamp,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent?.slice(0, 300),
    },
  })
  const status = input.status
  if (status && canAdvance(message.status, status)) {
    await prisma.emailMessage.update({
      where: { id: message.id },
      data: {
        status,
        deliveredAt: status === "DELIVERED" ? message.deliveredAt || timestamp : message.deliveredAt,
        openedAt: status === "OPENED" ? message.openedAt || timestamp : message.openedAt,
        lastOpenedAt: input.eventType === "open" ? timestamp : message.lastOpenedAt,
        openCount: input.eventType === "open" ? { increment: 1 } : undefined,
        clickedAt: status === "CLICKED" ? message.clickedAt || timestamp : message.clickedAt,
        clickCount: input.eventType === "click" ? { increment: 1 } : undefined,
        bouncedAt: status.includes("BOUNCE") ? timestamp : message.bouncedAt,
        failedAt: status === "FAILED" ? timestamp : message.failedAt,
        bounceType: input.bounceType || message.bounceType,
        bounceReason: input.bounceReason || message.bounceReason,
      },
    })
  } else if (input.eventType === "open") {
    await prisma.emailMessage.update({ where: { id: message.id }, data: { openCount: { increment: 1 }, lastOpenedAt: timestamp, openedAt: message.openedAt || timestamp } })
  } else if (input.eventType === "click") {
    await prisma.emailMessage.update({ where: { id: message.id }, data: { clickCount: { increment: 1 }, clickedAt: message.clickedAt || timestamp } })
  }
  if (input.bounceType === "hard") {
    await prisma.emailSuppression.upsert({
      where: { email: message.recipientEmail },
      update: { reason: input.bounceReason || "Hard bounce", bounceType: "hard" },
      create: { email: message.recipientEmail, reason: input.bounceReason || "Hard bounce", bounceType: "hard" },
    })
  }
  if (status === "COMPLAINED") {
    await prisma.emailSuppression.upsert({
      where: { email: message.recipientEmail },
      update: { reason: "Complaint", bounceType: "complaint" },
      create: { email: message.recipientEmail, reason: "Complaint", bounceType: "complaint" },
    })
  }
  return event
}

export async function processEmailJob(job: ClaimedJob) {
  const messageId = String(job.payload.messageId || "")
  const message = await prisma.emailMessage.findUnique({ where: { id: messageId } })
  if (!message) {
    await completeJob(job.id)
    return
  }
  if (message.providerMessageId && message.status !== "QUEUED" && message.status !== "PROCESSING" && message.status !== "DEFERRED") {
    await completeJob(job.id)
    return
  }
  const runtime = await emailRuntimeConfig()
  const suppressed = await prisma.emailSuppression.findUnique({ where: { email: message.recipientEmail } })
  const marketingBlocked = message.category === "marketing" && (suppressed || (await prisma.emailUnsubscribe.findUnique({ where: { email_category: { email: message.recipientEmail, category: message.category } } })))
  if (marketingBlocked || (suppressed?.bounceType === "hard")) {
    await prisma.emailMessage.update({ where: { id: message.id }, data: { status: suppressed?.bounceType === "hard" ? "HARD_BOUNCED" : "UNSUBSCRIBED" } })
    await completeJob(job.id)
    return
  }
  if (!(await withinRateLimit(runtime.policy))) {
    await prisma.queueJob.update({ where: { id: job.id }, data: { status: "QUEUED", lockedAt: null, lockedBy: null, attempts: { decrement: 1 }, runAt: new Date(Date.now() + 1000) } })
    return
  }
  await prisma.emailMessage.update({ where: { id: message.id }, data: { status: "PROCESSING", processingAt: new Date() } })
  const base = runtime.policy.publicBaseUrl.replace(/\/$/, "")
  const html = message.htmlBody ? applyTracking(message.htmlBody, message.trackingToken, runtime.policy, base) : undefined
  const from = runtime.policy.senderEmail || String(runtime.smtp?.from || "")
  try {
    const sent = await sendWithProvider(runtime, {
      to: message.recipientEmail,
      toName: message.recipientName || undefined,
      from: runtime.policy.senderName ? `${runtime.policy.senderName} <${from}>` : from,
      replyTo: runtime.policy.replyTo || undefined,
      subject: message.subject,
      text: message.textBody,
      html,
    })
    await prisma.emailMessage.update({
      where: { id: message.id },
      data: { status: "SENT", sentAt: new Date(), provider: runtime.policy.provider, providerMessageId: sent.providerMessageId },
    })
    await recordEmailEvent({ messageId: message.id, eventType: "sent", status: "SENT", providerMessageId: sent.providerMessageId })
    await completeJob(job.id)
    console.info(JSON.stringify({ jobId: job.id, queue: "email", campaignId: message.campaignId, status: "sent", timestamp: new Date().toISOString() }))
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Email provider failed."
    const dead = await failJob(job.id, reason, job.attempts, runtime.policy.maxRetries, backoffMs(job.attempts, runtime.policy))
    await prisma.emailMessage.update({ where: { id: message.id }, data: { status: dead ? "FAILED" : "DEFERRED", failedAt: dead ? new Date() : undefined } })
    await recordEmailEvent({ messageId: message.id, eventType: dead ? "failed" : "deferred", status: dead ? "FAILED" : "DEFERRED", metadata: { error: reason } })
  }
}

async function withinRateLimit(policy: { perSecond: number; perMinute: number; perHour: number; dailyLimit: number }) {
  const now = Date.now()
  const windows = [
    [policy.perSecond, 1000],
    [policy.perMinute, 60_000],
    [policy.perHour, 3_600_000],
    [policy.dailyLimit, 86_400_000],
  ] as const
  for (const [limit, span] of windows) {
    if (!limit) continue
    const count = await prisma.emailMessage.count({ where: { sentAt: { gte: new Date(now - span) } } })
    if (count >= limit) return false
  }
  return true
}

export async function processNotificationJob(job: ClaimedJob) {
  if (!(await isFeatureEnabled("notifications"))) {
    await completeJob(job.id)
    return
  }
  const userIds = Array.isArray(job.payload.userIds) ? (job.payload.userIds as string[]) : []
  const title = String(job.payload.title || "Notification")
  const body = String(job.payload.body || "")
  const type = String(job.payload.type || "general")
  const link = job.payload.link ? String(job.payload.link) : undefined
  if (userIds.length) {
    await prisma.notification.createMany({ data: userIds.map((userId) => ({ userId, title, body, type, link })) })
  }
  await completeJob(job.id)
}

export async function renderTemplate(key: string, vars: Record<string, string>, fallback: { subject: string; text: string }) {
  const template = await prisma.emailTemplate.findUnique({ where: { key } })
  if (!template || !template.active) return { subject: fillTemplate(fallback.subject, vars), text: fillTemplate(fallback.text, vars), html: "" }
  return {
    subject: fillTemplate(template.subject, vars),
    text: fillTemplate(template.text, vars),
    html: fillTemplate(template.html, vars),
  }
}
