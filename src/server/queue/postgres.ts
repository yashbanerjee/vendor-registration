import type { Prisma } from "@prisma/client"
import { prisma } from "@/server/db"
import type { ClaimedJob, EnqueueInput } from "@/server/queue/types"

export async function enqueueJob(input: EnqueueInput) {
  if (input.idempotencyKey) {
    const existing = await prisma.queueJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) return existing
  }
  return prisma.queueJob.create({
    data: {
      queue: input.queue,
      name: input.name,
      payload: input.payload as Prisma.InputJsonValue,
      priority: input.priority ?? 0,
      runAt: input.runAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 3,
      idempotencyKey: input.idempotencyKey,
      status: "QUEUED",
    },
  })
}

export async function claimJobs(workerId: string, limit: number, queue?: string): Promise<ClaimedJob[]> {
  const candidates = await prisma.queueJob.findMany({
    where: {
      status: "QUEUED",
      runAt: { lte: new Date() },
      ...(queue ? { queue } : {}),
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: limit,
  })
  const claimed: ClaimedJob[] = []
  for (const job of candidates) {
    const updated = await prisma.queueJob.updateMany({
      where: { id: job.id, status: "QUEUED" },
      data: { status: "PROCESSING", lockedAt: new Date(), lockedBy: workerId, attempts: { increment: 1 } },
    })
    if (updated.count !== 1) continue
    claimed.push({
      id: job.id,
      queue: job.queue,
      name: job.name,
      payload: (job.payload || {}) as Record<string, unknown>,
      attempts: job.attempts + 1,
      maxAttempts: job.maxAttempts,
    })
  }
  return claimed
}

export async function completeJob(id: string) {
  await prisma.queueJob.update({ where: { id }, data: { status: "COMPLETED", finishedAt: new Date(), lockedAt: null, lastError: null } })
}

export async function failJob(id: string, error: string, attempts: number, maxAttempts: number, delayMs: number) {
  const permanent = /hard bounce|suppressed|invalid recipient/i.test(error)
  const dead = permanent || attempts >= maxAttempts
  await prisma.queueJob.update({
    where: { id },
    data: dead
      ? { status: "DEAD", finishedAt: new Date(), lockedAt: null, lastError: error.slice(0, 2000) }
      : { status: "QUEUED", lockedAt: null, lockedBy: null, lastError: error.slice(0, 2000), runAt: new Date(Date.now() + delayMs) },
  })
  return dead
}
