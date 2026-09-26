import { MODULE_FEATURE } from "@/lib/constants"
import { can } from "@/lib/permissions"
import type { PublicUser } from "@/lib/types"
import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"
import { getSessionUser } from "@/server/session"

export async function isFeatureEnabled(key: string) {
  const flag = await prisma.featureFlag.findUnique({ where: { key } })
  if (!flag) return true
  return flag.enabled
}

export async function requireFeature(key?: string | null) {
  if (!key) return
  if (!(await isFeatureEnabled(key))) {
    throw new ApiError(403, "This module is turned off by a system administrator.")
  }
}

export async function requireUser(portals?: PublicUser["portal"][]) {
  const user = await getSessionUser()
  if (!user) throw new ApiError(401, "Please sign in to continue.")
  if (portals && !portals.includes(user.portal)) {
    throw new ApiError(403, "You do not have access to this area.")
  }
  return user
}

export async function authorize(options: {
  module?: string
  action?: string
  feature?: string | null
  portals?: PublicUser["portal"][]
}) {
  const user = await requireUser(options.portals)
  const feature =
    options.feature === undefined && options.module ? MODULE_FEATURE[options.module] : options.feature
  await requireFeature(feature)
  if (user.mustChangePassword) {
    throw new ApiError(403, "Change your password before continuing.")
  }
  if (user.portal === "VENDOR" && options.action && options.action !== "VIEW") {
    const status = user.vendor?.status || ""
    const approved = status === "APPROVED" || status === "ACTIVE"
    const editingProfile = (options.module === "vendors" || options.module === "documents") && (status === "DRAFT" || status === "CHANGES_REQUESTED")
    if (!approved && !editingProfile) {
      throw new ApiError(403, "Your company is not approved yet. You can view status, and update details only when a change has been requested.")
    }
  }
  if (options.module && options.action && !can(user, options.module, options.action)) {
    throw new ApiError(403, "You do not have permission for this action.")
  }
  return user
}

export function scopeVendor(user: PublicUser, requested?: string | null) {
  if (user.portal === "VENDOR") {
    if (!user.vendorId) throw new ApiError(403, "Your account is not linked to a vendor profile.")
    if (requested && requested !== user.vendorId) {
      throw new ApiError(403, "You can only access your own records.")
    }
    return user.vendorId
  }
  return requested || undefined
}
