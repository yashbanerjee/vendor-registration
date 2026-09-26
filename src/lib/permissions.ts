import type { PublicUser } from "@/lib/types"

export function can(
  user: Pick<PublicUser, "portal" | "role"> | null | undefined,
  module: string,
  action: string,
) {
  if (!user) return false
  if (user.portal === "SUPER_ADMIN" || user.role?.slug === "super-admin") return true
  const permission = user.role?.permissions.find((item) => item.module === module)
  if (!permission) return false
  if (permission.actions.includes("MANAGE")) return true
  return permission.actions.includes(action)
}

export function canAny(
  user: Pick<PublicUser, "portal" | "role"> | null | undefined,
  module: string,
  actions: string[],
) {
  return actions.some((action) => can(user, module, action))
}
