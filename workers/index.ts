import { loadLocalEnv } from "../src/server/load-env"

loadLocalEnv()

void import("../src/server/queue/runner")
  .then(({ runWorker }) => runWorker())
  .catch((error) => {
    console.info(JSON.stringify({ queue: "worker", status: "exit", error: error instanceof Error ? error.message : "failed" }))
    process.exit(1)
  })
