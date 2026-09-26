import { redirect } from "next/navigation"
import { Card } from "@/components/ui/card"
import { ModuleUnavailable, moduleEnabled } from "@/components/crm/feature-gate"
import { RecordForm } from "@/components/crm/record-form"
import { moduleByKey } from "@/config/modules"
import { can } from "@/lib/permissions"
import { duringRequest } from "@/server/live"
import { getSessionUser } from "@/server/session"

export async function NewRecordPage({ portal, moduleKey }: { portal: "admin" | "vendor"; moduleKey: string }) {
  await duringRequest()
  const user = await getSessionUser()
  if (!user) redirect(portal === "admin" ? "/admin/login" : "/login")
  if (portal === "admin" && user.portal === "VENDOR") redirect("/admin/login")
  if (portal === "vendor" && user.portal !== "VENDOR") redirect("/vendor")

  const config = moduleByKey(moduleKey)
  if (!config) {
    return <Card className="p-8"><h1 className="text-xl font-medium">This page is not available</h1></Card>
  }

  const allowed = portal === "vendor" ? Boolean(config.vendorCreatable) && can(user, config.permission, "CREATE") : Boolean(config.creatable) && can(user, config.permission, "CREATE")
  if (!allowed) {
    return (
      <Card className="p-8">
        <h1 className="text-xl font-medium">You cannot create this record</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your role does not include create access for {config.title.toLowerCase()}.</p>
      </Card>
    )
  }

  if (portal === "vendor") {
    const status = user.vendor?.status || ""
    const approved = status === "APPROVED" || status === "ACTIVE"
    const onboarding = status === "DRAFT" || status === "CHANGES_REQUESTED"
    if (!approved && !(onboarding && moduleKey === "documents")) {
      return <Card className="p-8"><h1 className="text-xl font-medium">Waiting for approval</h1><p className="mt-2 text-sm text-muted-foreground">This area opens after the company is approved.</p></Card>
    }
  }

  if (!(await moduleEnabled(moduleKey))) return <ModuleUnavailable title={config.title} />
  return <RecordForm portal={portal} moduleKey={moduleKey} user={user} />
}
