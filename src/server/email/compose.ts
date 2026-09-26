import { createHmac, randomBytes } from "crypto"
import type { EmailPolicy } from "@/server/email/settings"

export function fillTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "")
}

export function trackingToken() {
  return randomBytes(24).toString("base64url")
}

export function applyTracking(html: string, token: string, policy: EmailPolicy, baseUrl: string) {
  let next = html
  if (policy.trackingEnabled && policy.clickTracking && baseUrl) {
    next = next.replace(/href="(https?:\/\/[^"]+)"/g, (_match, url: string) => {
      if (url.includes("/email/click/") || url.includes("/email/unsubscribe/")) return `href="${url}"`
      const wrapped = `${baseUrl}/email/click/${token}?u=${encodeURIComponent(url)}`
      return `href="${wrapped}"`
    })
  }
  if (policy.trackingEnabled && policy.openTracking && baseUrl) {
    next += `<img src="${baseUrl}/email/open/${token}" width="1" height="1" alt="" />`
  }
  if (policy.unsubscribeEnabled && baseUrl) {
    next += `<p style="font-size:12px;color:#626f86">Marketing messages can be stopped here: ${baseUrl}/email/unsubscribe/${token}</p>`
  }
  return next
}

export function signWebhook(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex")
}

export function verifyWebhook(secret: string, body: string, signature: string | null) {
  if (!secret || !signature) return false
  const expected = signWebhook(secret, body)
  if (expected.length !== signature.length) return false
  let mismatch = 0
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index)
  return mismatch === 0
}
