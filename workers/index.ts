import { runWorker } from "../src/server/queue/runner"

runWorker().catch((error) => {
  console.info(JSON.stringify({ queue: "worker", status: "exit", error: error instanceof Error ? error.message : "failed" }))
  process.exit(1)
})
