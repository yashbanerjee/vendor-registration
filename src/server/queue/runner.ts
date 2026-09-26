import { processEmailJob, processNotificationJob } from "@/server/email/process"
import { dispatchOutbox } from "@/server/events/outbox"
import { claimJobs, completeJob, failJob } from "@/server/queue/postgres"
import type { ClaimedJob } from "@/server/queue/types"
import { backoffMs, emailPolicy } from "@/server/email/settings"

let timer: NodeJS.Timeout | null = null
let running = false

export function startDispatcher() {
  if (timer) return
  timer = setInterval(() => {
    void drainQueues("web").catch((error) => {
      console.info(JSON.stringify({ queue: "dispatcher", status: "error", error: error instanceof Error ? error.message : "failed", timestamp: new Date().toISOString() }))
    })
  }, 4000)
  timer.unref?.()
}

export async function drainQueues(workerId: string, limit = 10) {
  if (running) return
  running = true
  try {
    await dispatchOutbox(limit)
    const jobs = await claimJobs(workerId, limit)
    for (const job of jobs) {
      await runJob(job)
    }
  } finally {
    running = false
  }
}

async function runJob(job: ClaimedJob) {
  const started = Date.now()
  try {
    if (job.queue === "email" && job.name === "send") await processEmailJob(job)
    else if (job.queue === "notification") await processNotificationJob(job)
    else if (job.queue === "import") {
      const { processImportJob } = await import("@/server/jobs/import-job")
      await processImportJob(job)
      await completeJob(job.id)
    } else if (job.queue === "report" || job.queue === "document") {
      await completeJob(job.id)
    } else {
      await completeJob(job.id)
    }
    console.info(JSON.stringify({ jobId: job.id, queue: job.queue, status: "completed", duration: Date.now() - started, timestamp: new Date().toISOString() }))
  } catch (error) {
    const policy = await emailPolicy()
    const message = error instanceof Error ? error.message : "Job failed."
    await failJob(job.id, message, job.attempts, job.maxAttempts, backoffMs(job.attempts, policy))
    console.info(JSON.stringify({ jobId: job.id, queue: job.queue, status: "failed", error: message, duration: Date.now() - started, timestamp: new Date().toISOString() }))
  }
}

export async function runWorker() {
  const workerId = `worker-${process.pid}`
  const shutdown = () => {
    console.info(JSON.stringify({ queue: "worker", status: "shutdown", timestamp: new Date().toISOString() }))
    process.exit(0)
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
  const { emailRuntimeConfig } = await import("@/server/email/settings")
  const runtime = await emailRuntimeConfig()
  if (runtime.redisUrl) await startBullWorkers(runtime.redisUrl, workerId)
  for (;;) {
    await drainQueues(workerId, runtime.policy.batchSize || 10)
    await new Promise((resolve) => setTimeout(resolve, runtime.redisUrl ? 15000 : 2000))
  }
}

async function startBullWorkers(redisUrl: string, workerId: string) {
  const { Worker } = await import("bullmq")
  const { redisConnection } = await import("@/server/queue")
  for (const name of ["email", "notification", "import", "report", "document"]) {
    const worker = new Worker(name, async () => drainQueues(`${workerId}:bull`, 5), { connection: redisConnection(redisUrl), concurrency: 2 })
    worker.on("failed", (job, error) => {
      console.info(JSON.stringify({ jobId: job?.id, queue: name, status: "bull-failed", error: error.message, timestamp: new Date().toISOString() }))
    })
  }
}
