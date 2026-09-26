import { prisma } from "@/server/db"
import { recordEmailEvent } from "@/server/email/process"
import { emailPolicy } from "@/server/email/settings"
import { isFeatureEnabled } from "@/server/guard"

export const dynamic = "force-dynamic"

const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")

export async function GET(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const policy = await emailPolicy()
  if (policy.trackingEnabled && policy.openTracking && (await isFeatureEnabled("openTracking"))) {
    const message = await prisma.emailMessage.findUnique({ where: { trackingToken: token } })
    if (message) {
      await recordEmailEvent({
        messageId: message.id,
        eventType: "open",
        status: "OPENED",
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      })
    }
  }
  return new Response(pixel, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } })
}
