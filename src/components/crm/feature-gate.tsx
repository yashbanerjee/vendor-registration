import { Card } from "@/components/ui/card"
import { moduleByKey } from "@/config/modules"
import { MODULE_FEATURE } from "@/lib/constants"
import { prisma } from "@/server/db"

export async function moduleEnabled(moduleKey: string) {
  const config = moduleByKey(moduleKey)
  if (!config) return true
  const featureKey = MODULE_FEATURE[config.permission]
  if (!featureKey) return true
  const flag = await prisma.featureFlag.findUnique({ where: { key: featureKey } })
  return !flag || flag.enabled
}

export function ModuleUnavailable({ title }: { title: string }) {
  return (
    <Card className="p-8">
      <h1 className="text-xl font-semibold">{title} is turned off</h1>
      <p className="mt-2 text-sm text-muted-foreground">A system administrator can enable this module from Features.</p>
    </Card>
  )
}
