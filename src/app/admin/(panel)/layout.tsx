import { redirect } from "next/navigation"
import { Shell } from "@/components/crm/shell"
import { prisma } from "@/server/db"
import { duringRequest } from "@/server/live"
import { getSessionUser } from "@/server/session"

export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await duringRequest()
  let user
  try {
    user = await getSessionUser()
  } catch {
    return <DatabaseMessage />
  }
  if (!user || user.portal === "VENDOR") redirect("/admin/login")
  const [features, company] = await Promise.all([
    prisma.featureFlag.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.companySetting.findUnique({ where: { id: "default" } }),
  ])
  return (
    <Shell portal="admin" user={user} features={features} companyName={company?.companyName || "Vendor desk"} primaryColor={company?.primaryColor}>
      {children}
    </Shell>
  )
}

function DatabaseMessage() {
  return <main className="mx-auto max-w-lg p-10"><h1 className="text-2xl font-semibold">Database unavailable</h1><p className="mt-3 text-sm text-muted-foreground">Start PostgreSQL and confirm DATABASE_URL, then refresh this page.</p></main>
}
