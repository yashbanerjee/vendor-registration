import { prisma } from "@/server/db"
import { decryptSecret } from "@/server/crypto"

export type EmailPolicy = {
  provider: string
  senderName: string
  senderEmail: string
  replyTo: string
  publicBaseUrl: string
  dailyLimit: number
  perSecond: number
  perMinute: number
  perHour: number
  batchSize: number
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  trackingEnabled: boolean
  openTracking: boolean
  clickTracking: boolean
  bounceProcessing: boolean
  complaintProcessing: boolean
  unsubscribeEnabled: boolean
}

export const defaultEmailPolicy: EmailPolicy = {
  provider: "smtp",
  senderName: "",
  senderEmail: "",
  replyTo: "",
  publicBaseUrl: "",
  dailyLimit: 10000,
  perSecond: 5,
  perMinute: 120,
  perHour: 2000,
  batchSize: 25,
  maxRetries: 3,
  initialDelayMs: 30000,
  maxDelayMs: 3600000,
  trackingEnabled: true,
  openTracking: true,
  clickTracking: true,
  bounceProcessing: true,
  complaintProcessing: true,
  unsubscribeEnabled: true,
}

export async function emailPolicy(): Promise<EmailPolicy> {
  const row = await prisma.systemSetting.findUnique({ where: { key: "email.policy" } })
  return { ...defaultEmailPolicy, ...((row?.value || {}) as Partial<EmailPolicy>) }
}

export async function emailRuntimeConfig() {
  const policy = await emailPolicy()
  const [smtp, provider, redis, webhook] = await Promise.all([
    prisma.integrationSetting.findUnique({ where: { provider: "smtp" } }),
    prisma.integrationSetting.findUnique({ where: { provider: `email:${policy.provider}` } }),
    prisma.integrationSetting.findUnique({ where: { provider: "redis" } }),
    prisma.integrationSetting.findUnique({ where: { provider: "email-webhook" } }),
  ])
  const secret = async (cipher?: string | null) => (cipher ? decryptSecret(cipher).catch(() => "") : "")
  return {
    policy,
    smtp: smtp?.enabled ? { ...(smtp.config as { host?: string; port?: number; user?: string; from?: string; secure?: boolean }), password: await secret(smtp.secretCipher) } : null,
    providerSecret: await secret(provider?.secretCipher),
    providerConfig: (provider?.config || {}) as Record<string, unknown>,
    redisUrl: redis?.enabled ? await secret(redis.secretCipher) : "",
    webhookSecret: await secret(webhook?.secretCipher),
  }
}

export function backoffMs(attempt: number, policy: EmailPolicy) {
  const delay = policy.initialDelayMs * 2 ** Math.max(0, attempt - 1)
  return Math.min(policy.maxDelayMs, delay)
}
