import type { PublicUser } from "@/lib/types"
import { ApiError } from "@/server/errors"

export function businessScope(user: Pick<PublicUser, "portal" | "organizationId">) {
  if (user.portal === "SUPER_ADMIN") {
    throw new ApiError(403, "Organization records are not part of the platform workspace.")
  }
  if (!user.organizationId) {
    throw new ApiError(403, "This account is not assigned to an organization.")
  }
  return { organizationId: user.organizationId }
}

export function assertSameOrg(user: Pick<PublicUser, "portal" | "organizationId">, organizationId: string | null | undefined) {
  const scope = businessScope(user)
  if (!organizationId || organizationId !== scope.organizationId) {
    throw new ApiError(403, "This record belongs to another organization.")
  }
}
