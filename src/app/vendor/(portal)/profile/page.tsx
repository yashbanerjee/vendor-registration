import { VendorProfile } from "@/components/crm/vendor-profile"
import { prisma } from "@/server/db"
import { duringRequest } from "@/server/live"
import { getSessionUser } from "@/server/session"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function ProfilePage() {
  await duringRequest()
  const user = await getSessionUser()
  if (!user?.vendorId) redirect("/register")
  const company = await prisma.companySetting.findUnique({ where: { id: "default" } })
  return <VendorProfile id={user.vendorId} currency={company?.currency || "AED"} portal="vendor" />
}
