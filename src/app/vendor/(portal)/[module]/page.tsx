import { Card } from "@/components/ui/card"
import { ModuleUnavailable, moduleEnabled } from "@/components/crm/feature-gate"
import { ModuleScreen } from "@/components/crm/module-screen"
import { moduleByKey } from "@/config/modules"
import { prisma } from "@/server/db"
import { duringRequest } from "@/server/live"
import { getSessionUser } from "@/server/session"

export const dynamic = "force-dynamic"

export default async function VendorModule({ params }: { params: Promise<{ module: string }> }) {
  await duringRequest()
  const { module } = await params
  const user = await getSessionUser()
  const company = await prisma.companySetting.findUnique({ where: { id: "default" } })
  if (!user) return null
  const status = user.vendor?.status || ""
  const approved = status === "APPROVED" || status === "ACTIVE"
  const onboarding = status === "DRAFT" || status === "CHANGES_REQUESTED"
  if (!approved && !(onboarding && module === "documents")) {
    return <Card className="p-8"><h1 className="text-xl font-semibold">Waiting for approval</h1><p className="mt-2 text-sm text-muted-foreground">Your status is {status || "pending"}. This area opens after the company is approved.</p></Card>
  }
  if (!(await moduleEnabled(module))) return <ModuleUnavailable title={moduleByKey(module)?.title || "This module"} />
  return <ModuleScreen portal="vendor" moduleKey={module} user={user} currency={company?.currency || "AED"} />
}
