export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDispatcher } = await import("@/server/queue/runner")
    startDispatcher()
  }
}
