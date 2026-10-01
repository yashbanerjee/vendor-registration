import { z } from "zod"
import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"
import { clientMeta, ok, rateLimit, readJson } from "@/server/http"
import { audit } from "@/server/audit"
import { notifyStaff } from "@/server/notify"
import { createSession, clearSessionCookie, getSessionUser, loadPublicUser } from "@/server/session"
import { requireUser } from "@/server/guard"
import { createSuperAdmin, ensurePlatformDefaults } from "@/server/bootstrap"
import { identityChangePassword, identityLogin, managedPassword } from "@/server/identity-client"
import { saveVendorDetails, submitVendor } from "@/server/handlers/vendors"

const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/[0-9]/, "Include a number.")

export async function setupStatus() {
  const users = await prisma.user.count({ where: { deletedAt: null } })
  return ok({ needsSetup: users === 0 })
}

export async function setup(req: Request) {
  const meta = clientMeta(req)
  rateLimit(`setup:${meta.ip || "local"}`, 5, 60 * 60 * 1000)
  const users = await prisma.user.count()
  if (users > 0) throw new ApiError(409, "Setup has already been completed.")
  const body = z
    .object({
      companyName: z.string().min(2).max(160),
      name: z.string().min(2).max(120),
      email: z.string().email(),
      password: passwordSchema,
    })
    .parse(await readJson(req))
  await ensurePlatformDefaults()
  await prisma.companySetting.update({
    where: { id: "default" },
    data: { companyName: body.companyName, legalName: body.companyName },
  })
  const user = await createSuperAdmin(body)
  await createSession(user.id, meta)
  await audit({
    userId: user.id,
    action: "Completed first-run setup",
    module: "settings",
    recordId: user.id,
    recordLabel: user.email,
    ...meta,
  })
  return ok(await loadPublicUser(user.id), "Super admin account created.", undefined, 201)
}

export async function login(req: Request) {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(1),
      portal: z.enum(["admin", "vendor"]).optional(),
    })
    .parse(await readJson(req))
  const meta = clientMeta(req)
  rateLimit(`login:${meta.ip || "local"}:${body.email.toLowerCase()}`, 8, 15 * 60 * 1000)
  const identity = await identityLogin(body.email, body.password)
  const user = await prisma.user.findFirst({ where: { OR: [{ identityUserId: identity.identityUserId }, { email: body.email.toLowerCase() }] } })
  if (!user || user.deletedAt || user.status !== "ACTIVE") {
    throw new ApiError(401, "Email or password is incorrect.")
  }
  if (body.portal === "admin" && user.portal === "VENDOR") {
    throw new ApiError(403, "This account uses the vendor sign-in page.")
  }
  if (body.portal === "vendor" && user.portal !== "VENDOR") {
    throw new ApiError(403, "This account uses the staff sign-in page.")
  }
  await createSession(user.id, meta)
  await audit({ userId: user.id, action: "Signed in", module: "auth", recordId: user.id, recordLabel: user.email, ...meta })
  return ok(await loadPublicUser(user.id), "Signed in.")
}

export async function logout(req: Request) {
  const user = await getSessionUser()
  const meta = clientMeta(req)
  await clearSessionCookie()
  if (user) {
    await audit({ userId: user.id, action: "Signed out", module: "auth", recordId: user.id, recordLabel: user.email, ...meta })
  }
  return ok(null, "Signed out.")
}

export async function session() {
  const user = await getSessionUser()
  const [features, company] = await Promise.all([
    prisma.featureFlag.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.companySetting.findUnique({ where: { id: "default" } }),
  ])
  return ok({ user, features, company })
}

export async function changePassword(req: Request) {
  const current = await getSessionUser()
  if (!current) throw new ApiError(401, "Please sign in to continue.")
  const body = z.object({ currentPassword: z.string().min(1), password: passwordSchema }).parse(await readJson(req))
  const user = await prisma.user.findUnique({ where: { id: current.id } })
  if (!user?.identityUserId) throw new ApiError(401, "The current password is incorrect.")
  await identityChangePassword(user.identityUserId, body.currentPassword, body.password)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: managedPassword(), mustChangePassword: false } })
  await audit({ userId: user.id, action: "Changed password", module: "auth", recordId: user.id, recordLabel: user.email, ...clientMeta(req) })
  return ok(await loadPublicUser(user.id), "Password updated.")
}

export async function register(_req: Request): Promise<Response> {
  throw new ApiError(403, "Vendors are added by an administrator. Use the sign-in link from your invitation email.")
}

export async function saveRegistration(req: Request) {
  const user = await requireUser(["VENDOR"])
  if (!user.vendorId) throw new ApiError(403, "Your account is not linked to a vendor profile.")
  const vendor = await prisma.vendor.findUnique({ where: { id: user.vendorId } })
  if (!vendor || !["DRAFT", "CHANGES_REQUESTED"].includes(vendor.status)) {
    throw new ApiError(409, "This application can no longer be edited.")
  }
  const body = await readJson(req)
  const saved = await saveVendorDetails(vendor.id, body, user.id)
  return ok(saved, "Draft saved.")
}

export async function submitRegistration(req: Request) {
  const user = await requireUser(["VENDOR"])
  if (!user.vendorId) throw new ApiError(403, "Your account is not linked to a vendor profile.")
  const meta = clientMeta(req)
  const saved = await submitVendor(user.vendorId, user, meta)
  await notifyStaff("registration", { vendor: saved.legalName, title: "Registration received", body: "" }, `/admin/vendors/${saved.id}`)
  return ok(saved, "Application submitted.")
}

export async function registrationForm() {
  const [categories, services, emirates, documentTypes, fields, terms, tax] = await Promise.all([
    prisma.vendorCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.vendorService.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.emirate.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.documentType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.customField.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.paymentTerm.findMany({ where: { active: true }, orderBy: { days: "asc" } }),
    prisma.taxSetting.findUnique({ where: { id: "default" } }),
  ])
  return ok({ categories, services, emirates, documentTypes, fields, terms, tax })
}
