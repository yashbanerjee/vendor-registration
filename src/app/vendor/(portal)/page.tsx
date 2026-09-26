import { Dashboard } from "@/components/crm/dashboard"
import { prisma } from "@/server/db"
import { duringRequest } from "@/server/live"

export const dynamic = "force-dynamic"

export default async function VendorHome() {
  await duringRequest()
  const [features, company] = await Promise.all([
    prisma.featureFlag.findMany(),
    prisma.companySetting.findUnique({ where: { id: "default" } }),
  ])
  return <Dashboard portal="vendor" features={features} currency={company?.currency || "AED"} />
}
