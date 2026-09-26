import { Dashboard } from "@/components/crm/dashboard"
import { prisma } from "@/server/db"

export default async function VendorHome() {
  const [features, company] = await Promise.all([
    prisma.featureFlag.findMany(),
    prisma.companySetting.findUnique({ where: { id: "default" } }),
  ])
  return <Dashboard portal="vendor" features={features} currency={company?.currency || "AED"} />
}
