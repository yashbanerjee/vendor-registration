import { Dashboard } from "@/components/crm/dashboard"
import { prisma } from "@/server/db"
import { duringRequest } from "@/server/live"
import { getSessionUser } from "@/server/session"

export const dynamic = "force-dynamic"

export default async function VendorHome() {
  await duringRequest()
  const [features, company] = await Promise.all([
    prisma.featureFlag.findMany(),
    prisma.companySetting.findUnique({ where: { id: "default" } }),
  ])
  const user = await getSessionUser()
  if (!user) return null
  return <Dashboard portal="vendor" user={user} features={features} currency={company?.currency || "AED"} />
}
