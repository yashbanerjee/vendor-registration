import { ReportsPage } from "@/components/crm/reports-page"
import { prisma } from "@/server/db"
import { duringRequest } from "@/server/live"

export const dynamic = "force-dynamic"

export default async function Reports() {
  await duringRequest()
  const company = await prisma.companySetting.findUnique({ where: { id: "default" } })
  return <ReportsPage currency={company?.currency || "AED"} />
}
