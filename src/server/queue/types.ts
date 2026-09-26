export type QueueName = "email" | "notification" | "import" | "report" | "document"

export type EnqueueInput = {
  queue: QueueName
  name: string
  payload: Record<string, unknown>
  priority?: number
  runAt?: Date
  maxAttempts?: number
  idempotencyKey?: string
}

export type ClaimedJob = {
  id: string
  queue: string
  name: string
  payload: Record<string, unknown>
  attempts: number
  maxAttempts: number
}
