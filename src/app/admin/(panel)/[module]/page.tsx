import { ModuleUnavailable, moduleEnabled } from "@/components/crm/feature-gate"
import { ModuleScreen } from "@/components/crm/module-screen"
import { moduleByKey } from "@/config/modules"
import { prisma } from "@/server/db"
import { getSessionUser } from "@/server/session"

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params
  const user = await getSessionUser()
  const company = await prisma.companySetting.findUnique({ where: { id: "default" } })
  if (!user) return null
  if (!(await moduleEnabled(module))) return <ModuleUnavailable title={moduleByKey(module)?.title || "This module"} />
  return <ModuleScreen portal="admin" moduleKey={module} user={user} currency={company?.currency || "AED"} />
}
