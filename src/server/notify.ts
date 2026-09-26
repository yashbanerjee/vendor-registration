import { prisma } from "@/server/db"
import { isFeatureEnabled } from "@/server/guard"

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "")
}

export async function notifyUsers(
  userIds: string[],
  type: string,
  vars: Record<string, string>,
  link?: string,
) {
  if (!(await isFeatureEnabled("notifications"))) return
  const unique = [...new Set(userIds.filter(Boolean))]
  if (!unique.length) return
  const template = await prisma.notificationTemplate.findUnique({ where: { key: type } })
  if (template && !template.active) return
  const title = fill(template?.subject || vars.title || type, vars)
  const body = fill(template?.body || vars.body || "", vars)
  await prisma.notification.createMany({
    data: unique.map((userId) => ({ userId, title, body, type, link })),
  })
}

export async function notifyStaff(type: string, vars: Record<string, string>, link?: string) {
  const users = await prisma.user.findMany({
    where: { portal: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  })
  await notifyUsers(
    users.map((user) => user.id),
    type,
    vars,
    link,
  )
}

export async function notifyVendorUsers(vendorId: string, type: string, vars: Record<string, string>, link?: string) {
  const users = await prisma.user.findMany({
    where: { vendorId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  })
  await notifyUsers(
    users.map((user) => user.id),
    type,
    vars,
    link,
  )
}
