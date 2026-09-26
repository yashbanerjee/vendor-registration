import { VendorProfile } from "@/components/crm/vendor-profile"
import { prisma } from "@/server/db"
import { getSessionUser } from "@/server/session"
import { redirect } from "next/navigation"

export default async function ProfilePage() {
  const user = await getSessionUser()
  if (!user?.vendorId) redirect("/register")
  const company = await prisma.companySetting.findUnique({ where: { id: "default" } })
  return <VendorProfile id={user.vendorId} currency={company?.currency || "AED"} portal="vendor" />
}
