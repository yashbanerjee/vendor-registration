import type { PublicUser } from "@/lib/types"
import { moduleAllowed } from "@/lib/access-policy"

export function can(
  user: Pick<PublicUser, "portal" | "role"> | null | undefined,
  module: string,
  action: string,
) {
  if (!user) return false
  const permission = user.role?.permissions.find((item) => item.module === module)
  const roleAllows = Boolean(permission && (permission.actions.includes("MANAGE") || permission.actions.includes(action)))
  if (user.portal === "SUPER_ADMIN" || user.role?.slug === "super-admin") return moduleAllowed("SUPER_ADMIN", module, roleAllows)
  return moduleAllowed(user.portal, module, roleAllows)
}

export function canAny(
  user: Pick<PublicUser, "portal" | "role"> | null | undefined,
  module: string,
  actions: string[],
) {
  return actions.some((action) => can(user, module, action))
}
