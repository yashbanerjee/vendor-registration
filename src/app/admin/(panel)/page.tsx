import { Dashboard } from "@/components/crm/dashboard"
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
  return <Dashboard portal="admin" features={features} currency={company?.currency || "AED"} />
}
