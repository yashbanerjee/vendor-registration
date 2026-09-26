import { Dashboard } from "@/components/crm/dashboard"
import { PlatformHome } from "@/components/crm/platform-home"
import { prisma } from "@/server/db"
import { duringRequest } from "@/server/live"
import { getSessionUser } from "@/server/session"

export const dynamic = "force-dynamic"

export default async function AdminHome() {
  await duringRequest()
  const user = await getSessionUser()
  const [features, company] = await Promise.all([
    prisma.featureFlag.findMany(),
    prisma.companySetting.findUnique({ where: { id: "default" } }),
  ])
  if (!user) return null
  if (user.portal === "SUPER_ADMIN") return <PlatformHome />
  return <Dashboard portal="admin" user={user} features={features} currency={company?.currency || "AED"} />
}
