import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"
import { authorize } from "@/server/guard"
import { ok, readJson } from "@/server/http"
import { z } from "zod"

const queues = ["email", "notification", "import", "report", "document"]

async function queueAdmin() {
  return authorize({ module: "settings", action: "VIEW", portals: ["SUPER_ADMIN", "ADMIN"], feature: "emailQueue" })
}

export async function queueSummary() {
  await queueAdmin()
  const grouped = await prisma.queueJob.groupBy({ by: ["queue", "status"], _count: { _all: true } })
  const summary = Object.fromEntries(queues.map((queue) => [queue, { QUEUED: 0, PROCESSING: 0, COMPLETED: 0, FAILED: 0, DEAD: 0, CANCELLED: 0 }])) as Record<string, Record<string, number>>
  for (const row of grouped) {
    if (!summary[row.queue]) summary[row.queue] = {}
    summary[row.queue][row.status] = row._count._all
  }
  const since = new Date(Date.now() - 60_000)
  const processed = await prisma.queueJob.count({ where: { finishedAt: { gte: since }, status: "COMPLETED" } })
  return ok({ queues: summary, completedLastMinute: processed, worker: "poll" }, "Queue status loaded.")
}

export async function listJobs(req: Request, params: Record<string, string>) {
  await queueAdmin()
  if (!queues.includes(params.queueName)) throw new ApiError(404, "Unknown queue.")
  const status = new URL(req.url).searchParams.get("status") || "DEAD"
  const rows = await prisma.queueJob.findMany({
    where: { queue: params.queueName, status },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, name: true, status: true, attempts: true, maxAttempts: true, lastError: true, runAt: true, createdAt: true, finishedAt: true },
  })
  return ok(rows, "Jobs loaded.")
}

export async function retryJob(req: Request, params: Record<string, string>) {
  await queueAdmin()
  const body = z.object({ jobId: z.string() }).parse(await readJson(req))
  const job = await prisma.queueJob.findFirst({ where: { id: body.jobId, queue: params.queueName } })
  if (!job) throw new ApiError(404, "Job not found.")
  await prisma.queueJob.update({ where: { id: job.id }, data: { status: "QUEUED", runAt: new Date(), lockedAt: null, lockedBy: null, lastError: null, finishedAt: null } })
  return ok({ id: job.id }, "Job queued again.")
}

export async function cancelJob(req: Request, params: Record<string, string>) {
  await queueAdmin()
  const body = z.object({ jobId: z.string(), remove: z.boolean().optional() }).parse(await readJson(req))
  if (body.remove) {
    await prisma.queueJob.delete({ where: { id: body.jobId } })
    return ok({ id: body.jobId }, "Job deleted.")
  }
  await prisma.queueJob.update({ where: { id: body.jobId }, data: { status: "CANCELLED", finishedAt: new Date() } })
  return ok({ id: body.jobId }, "Job cancelled.")
}
