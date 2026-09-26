import { VendorProfile } from "@/components/crm/vendor-profile"
import { prisma } from "@/server/db"
import { duringRequest } from "@/server/live"

export const dynamic = "force-dynamic"

export default async function VendorRecord({ params }: { params: Promise<{ id: string }> }) {
  await duringRequest()
  const { id } = await params
  const company = await prisma.companySetting.findUnique({ where: { id: "default" } })
  return <VendorProfile id={id} currency={company?.currency || "AED"} />
}
