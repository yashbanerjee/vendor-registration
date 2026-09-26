import { createHash, randomBytes } from "crypto"
import { cookies } from "next/headers"
import { hashPassword, verifyPassword } from "@/server/password"
import { prisma } from "@/server/db"
import type { PublicUser } from "@/lib/types"

const COOKIE = "vms_session"
const MAX_AGE = 60 * 60 * 24 * 7

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function newSessionToken() {
  const token = randomBytes(32).toString("base64url")
  return { token, hash: hashToken(token) }
}

export { hashPassword, verifyPassword }

export async function setSessionCookie(token: string) {
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  })
}

export async function clearSessionCookie() {
  const jar = await cookies()
  jar.delete(COOKIE)
}

const userInclude = {
  role: { include: { permissions: true } },
  vendor: {
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      vendorCode: true,
      status: true,
      logoUrl: true,
      draftStep: true,
    },
  },
} as const

export function toPublicUser(user: {
  id: string
  email: string
  name: string
  phone: string | null
  portal: PublicUser["portal"]
  status: string
  mustChangePassword: boolean
  vendorId: string | null
  vendor: PublicUser["vendor"]
  role: {
    id: string
    name: string
    slug: string
    permissions: { module: string; actions: string[] }[]
  } | null
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    portal: user.portal,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    vendorId: user.vendorId,
    vendor: user.vendor,
    role: user.role
      ? {
          id: user.role.id,
          name: user.role.name,
          slug: user.role.slug,
          permissions: user.role.permissions.map((item) => ({
            module: item.module,
            actions: item.actions,
          })),
        }
      : null,
  }
}

export async function loadPublicUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude })
  return user ? toPublicUser(user) : null
}

export async function getSessionUser() {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: userInclude } },
  })
  if (!session || session.expiresAt < new Date()) return null
  if (session.user.deletedAt || session.user.status !== "ACTIVE") return null
  return toPublicUser(session.user)
}

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const { token, hash } = newSessionToken()
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + MAX_AGE * 1000),
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  })
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } })
  await setSessionCookie(token)
}
