import nodemailer from "nodemailer"
import { prisma } from "@/server/db"
import { decryptSecret } from "@/server/crypto"

export function requestOrigin(req: Request) {
  const url = new URL(req.url)
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "")
  return `${proto}://${host}`
}

export async function sendMail(input: { to: string; subject: string; text: string }) {
  const row = await prisma.integrationSetting.findUnique({ where: { provider: "smtp" } })
  if (!row?.enabled || !row.secretCipher) return false
  const config = (row.config || {}) as { host?: string; port?: number; user?: string; from?: string; secure?: boolean }
  if (!config.host || !config.from) return false
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: Number(config.port || 587),
      secure: Boolean(config.secure),
      auth: config.user ? { user: config.user, pass: await decryptSecret(row.secretCipher) } : undefined,
    })
    await transporter.sendMail({ from: config.from, to: input.to, subject: input.subject, text: input.text })
    return true
  } catch {
    return false
  }
}
