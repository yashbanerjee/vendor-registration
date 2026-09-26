import { enqueueJob } from "@/server/queue/postgres"
import type { EnqueueInput } from "@/server/queue/types"

export async function enqueue(input: EnqueueInput) {
  const job = await enqueueJob(input)
  await mirrorToBull(job.id, input).catch(() => undefined)
  return job
}

async function mirrorToBull(jobId: string, input: EnqueueInput) {
  const { redisUrl } = await import("@/server/email/settings").then((mod) => mod.emailRuntimeConfig())
  if (!redisUrl) return
  const { Queue } = await import("bullmq")
  const queue = new Queue(input.queue, { connection: redisConnection(redisUrl) })
  try {
    await queue.add(input.name, { jobId }, { jobId, delay: input.runAt ? Math.max(0, input.runAt.getTime() - Date.now()) : 0 })
  } finally {
    await queue.close()
  }
}

export function redisConnection(url: string) {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    maxRetriesPerRequest: null as null,
  }
}
