import { ReportsPage } from "@/components/crm/reports-page"
import { prisma } from "@/server/db"

export default async function Reports() {
  const company = await prisma.companySetting.findUnique({ where: { id: "default" } })
  return <ReportsPage currency={company?.currency || "AED"} />
}
