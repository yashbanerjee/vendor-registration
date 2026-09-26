import { createHash, createHmac, randomBytes } from "crypto"
import http from "http"
import bcrypt from "bcryptjs"
import { prisma } from "@/server/db"

const PORT = 4010
let listening = false

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function totp(secret: string, at = Date.now()) {
  const counter = Math.floor(at / 30000)
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac("sha1", Buffer.from(secret, "hex")).update(buffer).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000
  return String(code).padStart(6, "0")
}

function totpMatches(secret: string, code: string) {
  const now = Date.now()
  return [now - 30000, now, now + 30000].some((at) => totp(secret, at) === code)
}

async function serviceKey() {
  const row = await prisma.systemSetting.findUnique({ where: { key: "identity.serviceKey" } })
  if (typeof row?.value === "string" && row.value.length > 20) return row.value
  const key = randomBytes(32).toString("base64url")
  await prisma.systemSetting.upsert({
    where: { key: "identity.serviceKey" },
    update: {},
    create: { key: "identity.serviceKey", value: key, group: "identity", isSecret: true },
  })
  return key
}

async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

async function audit(identityId: string | null, action: string, ip?: string) {
  await prisma.authAudit.create({ data: { identityId, action, ip: ip || null } })
}

async function issueTokens(identityId: string) {
  const access = randomBytes(32).toString("base64url")
  const refresh = randomBytes(32).toString("base64url")
  const accessExpires = new Date(Date.now() + 15 * 60 * 1000)
  const refreshExpires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  await prisma.identityAccessToken.create({ data: { identityId, tokenHash: sha(access), expiresAt: accessExpires } })
  await prisma.identityRefreshToken.create({ data: { identityId, tokenHash: sha(refresh), expiresAt: refreshExpires } })
  return { accessToken: access, refreshToken: refresh, expiresIn: 900, identityUserId: identityId }
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1")
  const path = url.pathname
  const ip = req.socket.remoteAddress
  try {
    const body = req.method === "GET" ? {} : await readBody(req)
    const key = await serviceKey()
    const internal = path.startsWith("/internal/")
    if (internal && req.headers["x-service-key"] !== key) {
      send(res, 401, { success: false, message: "Service credentials were rejected." })
      return
    }
    if (req.method === "POST" && path === "/auth/login") {
      const email = String(body.email || "").toLowerCase()
      const password = String(body.password || "")
      const account = await prisma.identityAccount.findUnique({ where: { email } })
      const valid = account ? await bcrypt.compare(password, account.passwordHash) : false
      if (!account || !valid || account.status !== "ACTIVE" || (account.lockedUntil && account.lockedUntil > new Date())) {
        if (account) await prisma.identityAccount.update({ where: { id: account.id }, data: { failedAttempts: { increment: 1 } } })
        await audit(account?.id || null, "login_failed", ip)
        send(res, 401, { success: false, message: "Email or password is incorrect." })
        return
      }
      if (account.mfaEnabled) {
        if (!account.mfaSecret || !totpMatches(account.mfaSecret, String(body.code || ""))) {
          send(res, 401, { success: false, message: "A valid authentication code is required.", mfaRequired: true })
          return
        }
      }
      await prisma.identityAccount.update({ where: { id: account.id }, data: { failedAttempts: 0 } })
      await audit(account.id, "login", ip)
      send(res, 200, { success: true, ...(await issueTokens(account.id)) })
      return
    }
    if (req.method === "POST" && path === "/auth/refresh") {
      const row = await prisma.identityRefreshToken.findUnique({ where: { tokenHash: sha(String(body.refreshToken || "")) } })
      if (!row || row.expiresAt < new Date()) {
        send(res, 401, { success: false, message: "Refresh token is not valid." })
        return
      }
      await prisma.identityRefreshToken.delete({ where: { id: row.id } })
      send(res, 200, { success: true, ...(await issueTokens(row.identityId)) })
      return
    }
    if (req.method === "POST" && path === "/auth/logout") {
      await prisma.identityRefreshToken.deleteMany({ where: { tokenHash: sha(String(body.refreshToken || "missing")) } })
      send(res, 200, { success: true })
      return
    }
    if (req.method === "POST" && path === "/auth/validate-token") {
      const row = await prisma.identityAccessToken.findUnique({ where: { tokenHash: sha(String(body.accessToken || "")) } })
      if (!row || row.expiresAt < new Date()) {
        send(res, 401, { success: false, message: "Access token is not valid." })
        return
      }
      send(res, 200, { success: true, identityUserId: row.identityId })
      return
    }
    if (req.method === "GET" && path === "/auth/me") {
      const header = String(req.headers.authorization || "")
      const token = header.startsWith("Bearer ") ? header.slice(7) : ""
      const row = await prisma.identityAccessToken.findUnique({ where: { tokenHash: sha(token) } })
      if (!row || row.expiresAt < new Date()) {
        send(res, 401, { success: false, message: "Access token is not valid." })
        return
      }
      const account = await prisma.identityAccount.findUnique({ where: { id: row.identityId } })
      send(res, 200, { success: true, identityUserId: account?.id, email: account?.email, mfaEnabled: account?.mfaEnabled })
      return
    }
    if (req.method === "POST" && path === "/auth/forgot-password") {
      const account = await prisma.identityAccount.findUnique({ where: { email: String(body.email || "").toLowerCase() } })
      if (account) {
        const token = randomBytes(32).toString("base64url")
        await prisma.identityResetToken.create({ data: { identityId: account.id, tokenHash: sha(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } })
        await audit(account.id, "reset_requested", ip)
        send(res, 200, { success: true, resetToken: req.headers["x-service-key"] === key ? token : undefined })
        return
      }
      send(res, 200, { success: true })
      return
    }
    if (req.method === "POST" && path === "/auth/reset-password") {
      const row = await prisma.identityResetToken.findUnique({ where: { tokenHash: sha(String(body.token || "")) } })
      if (!row || row.expiresAt < new Date()) {
        send(res, 400, { success: false, message: "Reset token is not valid." })
        return
      }
      await prisma.identityAccount.update({ where: { id: row.identityId }, data: { passwordHash: await bcrypt.hash(String(body.password || ""), 12) } })
      await prisma.identityResetToken.delete({ where: { id: row.id } })
      await audit(row.identityId, "password_reset", ip)
      send(res, 200, { success: true })
      return
    }
    if (req.method === "POST" && path === "/auth/mfa/enroll") {
      const account = await prisma.identityAccount.findUnique({ where: { id: String(body.identityUserId || "") } })
      if (!account || req.headers["x-service-key"] !== key) {
        send(res, 401, { success: false, message: "Service credentials were rejected." })
        return
      }
      const secret = randomBytes(20).toString("hex")
      await prisma.identityAccount.update({ where: { id: account.id }, data: { mfaSecret: secret, mfaEnabled: false } })
      send(res, 200, { success: true, secret })
      return
    }
    if (req.method === "POST" && path === "/auth/mfa/confirm") {
      const account = await prisma.identityAccount.findUnique({ where: { id: String(body.identityUserId || "") } })
      if (!account?.mfaSecret || !totpMatches(account.mfaSecret, String(body.code || ""))) {
        send(res, 400, { success: false, message: "The authentication code did not match." })
        return
      }
      await prisma.identityAccount.update({ where: { id: account.id }, data: { mfaEnabled: true } })
      send(res, 200, { success: true })
      return
    }
    if (req.method === "POST" && path === "/internal/accounts") {
      const email = String(body.email || "").toLowerCase()
      const existing = await prisma.identityAccount.findUnique({ where: { email } })
      if (existing) {
        send(res, 200, { success: true, identityUserId: existing.id })
        return
      }
      const account = await prisma.identityAccount.create({
        data: { email, passwordHash: await bcrypt.hash(String(body.password || ""), 12), status: "ACTIVE" },
      })
      await audit(account.id, "provisioned", ip)
      send(res, 201, { success: true, identityUserId: account.id })
      return
    }
    if (req.method === "POST" && path === "/internal/password") {
      const account = await prisma.identityAccount.findUnique({ where: { id: String(body.identityUserId || "") } })
      if (!account || !(await bcrypt.compare(String(body.currentPassword || ""), account.passwordHash))) {
        send(res, 401, { success: false, message: "The current password is incorrect." })
        return
      }
      await prisma.identityAccount.update({ where: { id: account.id }, data: { passwordHash: await bcrypt.hash(String(body.password || ""), 12) } })
      await audit(account.id, "password_changed", ip)
      send(res, 200, { success: true })
      return
    }
    if (req.method === "POST" && path === "/internal/set-password") {
      const account = await prisma.identityAccount.findUnique({ where: { id: String(body.identityUserId || "") } })
      if (!account) {
        send(res, 404, { success: false, message: "Identity account was not found." })
        return
      }
      await prisma.identityAccount.update({ where: { id: account.id }, data: { passwordHash: await bcrypt.hash(String(body.password || ""), 12) } })
      await audit(account.id, "password_set", ip)
      send(res, 200, { success: true })
      return
    }
    if (req.method === "POST" && path === "/internal/status") {
      await prisma.identityAccount.update({ where: { id: String(body.identityUserId || "") }, data: { status: String(body.status || "ACTIVE") } })
      send(res, 200, { success: true })
      return
    }
    send(res, 404, { success: false, message: "Not found." })
  } catch (error) {
    send(res, 500, { success: false, message: error instanceof Error ? error.message : "Identity service failed." })
  }
}

export function startIdentityService() {
  if (listening) return
  const server = http.createServer((req, res) => {
    void handle(req, res)
  })
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") return
    console.info(JSON.stringify({ service: "identity", status: "error", error: error.message }))
  })
  server.listen(PORT, "127.0.0.1")
  listening = true
}

if ((process.argv[1] || "").includes("identity-service")) startIdentityService()
