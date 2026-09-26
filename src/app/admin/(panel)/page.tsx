import { Dashboard } from "@/components/crm/dashboard"
import { prisma } from "@/server/db"
import { getSessionUser } from "@/server/session"

export default async function AdminHome() {
  const user = await getSessionUser()
  const [features, company] = await Promise.all([
    prisma.featureFlag.findMany(),
    prisma.companySetting.findUnique({ where: { id: "default" } }),
  ])
  if (!user) return null
  return <Dashboard portal="admin" features={features} currency={company?.currency || "AED"} />
}
