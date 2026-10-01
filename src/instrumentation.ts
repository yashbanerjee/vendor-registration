export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensurePlatformDefaults } = await import("@/server/bootstrap")
    const { startDispatcher } = await import("@/server/queue/runner")
    await ensurePlatformDefaults()
    startDispatcher()
  }
}
