import { Prisma } from "@prisma/client"
import { prisma } from "@/server/db"

export async function audit(input: {
  userId?: string | null
  action: string
  module: string
  recordId?: string | null
  recordLabel?: string | null
  oldValue?: unknown
  newValue?: unknown
  ip?: string
  userAgent?: string
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId || null,
      action: input.action,
      module: input.module,
      recordId: input.recordId || null,
      recordLabel: input.recordLabel || null,
      oldValue: input.oldValue === undefined ? undefined : (input.oldValue as Prisma.InputJsonValue),
      newValue: input.newValue === undefined ? undefined : (input.newValue as Prisma.InputJsonValue),
      ip: input.ip,
      userAgent: input.userAgent,
    },
  })
}
