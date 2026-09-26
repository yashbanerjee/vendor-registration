import { VendorProfile } from "@/components/crm/vendor-profile"
import { prisma } from "@/server/db"

export default async function VendorRecord({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await prisma.companySetting.findUnique({ where: { id: "default" } })
  return <VendorProfile id={id} currency={company?.currency || "AED"} />
}
