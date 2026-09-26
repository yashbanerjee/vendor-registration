import { prisma } from "@/server/db"
import { getSessionUser } from "@/server/session"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user || user.portal === "VENDOR" || user.role?.slug === "staff") return new Response("Forbidden", { status: 403 })
  const campaignId = new URL(req.url).searchParams.get("campaignId")
  const encoder = new TextEncoder()
  let closed = false
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      try {
        while (!closed) {
          if (campaignId) {
            const grouped = await prisma.emailMessage.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } })
            send("campaign:progress", Object.fromEntries(grouped.map((row) => [row.status, row._count._all])))
          } else {
            const grouped = await prisma.queueJob.groupBy({ by: ["queue", "status"], _count: { _all: true } })
            send("queue:status", grouped.map((row) => ({ queue: row.queue, status: row.status, count: row._count._all })))
          }
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      } catch {
        closed = true
      }
    },
    cancel() {
      closed = true
    },
  })
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  })
}
