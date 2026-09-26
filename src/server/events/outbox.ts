import type { Prisma } from "@prisma/client"
import { prisma } from "@/server/db"

type Tx = Prisma.TransactionClient

export async function publishEvent(
  event: { eventType: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown> },
  tx: Tx = prisma,
) {
  return tx.outboxEvent.create({
    data: {
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as Prisma.InputJsonValue,
      status: "PENDING",
    },
  })
}

export async function dispatchOutbox(limit = 20) {
  const rows = await prisma.outboxEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
  })
  for (const row of rows) {
    const locked = await prisma.outboxEvent.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "PROCESSING" } })
    if (locked.count !== 1) continue
    try {
      const { routeDomainEvent } = await import("@/server/events/router")
      await routeDomainEvent(row.eventType, (row.payload || {}) as Record<string, unknown>, row.id)
      await prisma.outboxEvent.update({ where: { id: row.id }, data: { status: "PROCESSED", processedAt: new Date() } })
    } catch (error) {
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { status: row.retryCount >= 5 ? "FAILED" : "PENDING", retryCount: { increment: 1 } },
      })
      console.info(JSON.stringify({ queue: "outbox", eventId: row.id, status: "retry", error: error instanceof Error ? error.message : "failed" }))
    }
  }
}
