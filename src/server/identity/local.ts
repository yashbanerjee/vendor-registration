import { createHmac } from "crypto"
import bcrypt from "bcryptjs"
import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"

function totp(secret: string, at = Date.now()) {
  const counter = Math.floor(at / 30000)
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac("sha1", Buffer.from(secret, "hex")).update(buffer).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000
  return String(code).padStart(6, "0")
}

const MANAGED = "identity-managed"

export async function loginWithIdentity(email: string, password: string, code?: string) {
  const normalized = email.toLowerCase()
  let account = await prisma.identityAccount.findUnique({ where: { email: normalized } })
  if (!account) {
    const user = await prisma.user.findUnique({ where: { email: normalized } })
    if (!user?.passwordHash || user.passwordHash === MANAGED || !user.passwordHash.startsWith("$2")) {
      throw new ApiError(401, "Email or password is incorrect.")
    }
    account = await prisma.identityAccount.create({
      data: {
        email: normalized,
        passwordHash: user.passwordHash,
        status: user.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
      },
    })
    await prisma.user.update({
      where: { id: user.id },
      data: { identityUserId: account.id, passwordHash: MANAGED },
    })
  }
  const valid = await bcrypt.compare(password, account.passwordHash)
  if (valid && account.mfaEnabled) {
    const now = Date.now()
    const matches = account.mfaSecret && [now - 30000, now, now + 30000].some((at) => totp(account.mfaSecret || "", at) === (code || ""))
    if (!matches) throw new ApiError(401, "A valid authentication code is required.")
  }
  if (!valid || account.status !== "ACTIVE" || (account.lockedUntil && account.lockedUntil > new Date())) {
    await prisma.identityAccount.update({ where: { id: account.id }, data: { failedAttempts: { increment: 1 } } })
    throw new ApiError(401, "Email or password is incorrect.")
  }
  await prisma.identityAccount.update({ where: { id: account.id }, data: { failedAttempts: 0 } })
  return { identityUserId: account.id }
}

export async function provisionLocalIdentity(email: string, password: string) {
  const normalized = email.toLowerCase()
  const existing = await prisma.identityAccount.findUnique({ where: { email: normalized } })
  if (existing) return existing.id
  const account = await prisma.identityAccount.create({
    data: { email: normalized, passwordHash: await bcrypt.hash(password, 12), status: "ACTIVE" },
  })
  return account.id
}

export async function changeLocalIdentityPassword(identityUserId: string, currentPassword: string, password: string) {
  const account = await prisma.identityAccount.findUnique({ where: { id: identityUserId } })
  if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
    throw new ApiError(401, "The current password is incorrect.")
  }
  await prisma.identityAccount.update({ where: { id: account.id }, data: { passwordHash: await bcrypt.hash(password, 12) } })
}

export async function setLocalIdentityPassword(identityUserId: string, password: string) {
  const account = await prisma.identityAccount.findUnique({ where: { id: identityUserId } })
  if (!account) throw new ApiError(404, "Identity account was not found.")
  await prisma.identityAccount.update({ where: { id: account.id }, data: { passwordHash: await bcrypt.hash(password, 12) } })
}

export async function setLocalIdentityStatus(identityUserId: string, status: string) {
  if (status !== "ACTIVE" && status !== "SUSPENDED") throw new ApiError(400, "Status is not valid.")
  await prisma.identityAccount.update({ where: { id: identityUserId }, data: { status } })
}
