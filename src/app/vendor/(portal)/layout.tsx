import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { Shell } from "@/components/crm/shell"
import { prisma } from "@/server/db"
import { duringRequest } from "@/server/live"
import { getSessionUser } from "@/server/session"

export const dynamic = "force-dynamic"

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  await duringRequest()
  const user = await getSessionUser()
  if (!user || user.portal !== "VENDOR") redirect("/login")
  const path = (await headers()).get("x-pathname") || ""
  if (user.mustChangePassword && path !== "/vendor/password") redirect("/vendor/password")
  const [features, company] = await Promise.all([
    prisma.featureFlag.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.companySetting.findUnique({ where: { id: "default" } }),
  ])
  return (
    <Shell portal="vendor" user={user} features={features} companyName={company?.companyName || "Vendor portal"} primaryColor={company?.primaryColor}>
      {children}
    </Shell>
  )
}
