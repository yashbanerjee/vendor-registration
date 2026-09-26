export type AccessPortal = "SUPER_ADMIN" | "ADMIN" | "VENDOR"

const PLATFORM_MODULES = new Set(["users", "roles", "settings", "features", "audit", "notifications"])

export function isPlatformModule(module: string) {
  return PLATFORM_MODULES.has(module)
}

export function moduleAllowed(portal: AccessPortal, module: string, roleAllows: boolean) {
  if (portal === "SUPER_ADMIN") return isPlatformModule(module)
  if (portal === "VENDOR" && isPlatformModule(module)) return false
  return roleAllows
}

export type AccessSubject = {
  portal: AccessPortal
  organizationId: string | null
  vendorId: string | null
  isOrgAdmin: boolean
  teamAdminIds: string[]
}

export function decideAccess(
  subject: AccessSubject,
  request: { module: string; organizationId?: string | null; vendorId?: string | null; teamId?: string | null },
) {
  if (subject.portal === "SUPER_ADMIN") {
    return isPlatformModule(request.module) ? "allow" : "deny"
  }
  if (isPlatformModule(request.module) && request.module !== "notifications") {
    if (request.module === "settings" || request.module === "users" || request.module === "roles" || request.module === "features" || request.module === "audit") {
      if (!subject.isOrgAdmin && subject.teamAdminIds.length > 0 && request.module !== "users") return "deny"
    }
  }
  if (request.organizationId && subject.organizationId && request.organizationId !== subject.organizationId) return "deny"
  if (subject.portal === "VENDOR") {
    if (!subject.vendorId || (request.vendorId && request.vendorId !== subject.vendorId)) return "deny"
    return "allow"
  }
  if (request.teamId && subject.teamAdminIds.length > 0 && !subject.isOrgAdmin && !subject.teamAdminIds.includes(request.teamId)) return "deny"
  return "allow"
}
