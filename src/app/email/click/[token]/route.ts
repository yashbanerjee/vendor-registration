import { NextResponse } from "next/server"
import { prisma } from "@/server/db"
import { recordEmailEvent } from "@/server/email/process"
import { emailPolicy } from "@/server/email/settings"
import { isFeatureEnabled } from "@/server/guard"

export const dynamic = "force-dynamic"

export async function GET(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const target = new URL(req.url).searchParams.get("u") || "/"
  let destination = "/"
  try {
    const url = new URL(target)
    if (url.protocol === "http:" || url.protocol === "https:") destination = url.toString()
  } catch {
    destination = "/"
  }
  const policy = await emailPolicy()
  if (policy.trackingEnabled && policy.clickTracking && (await isFeatureEnabled("clickTracking"))) {
    const message = await prisma.emailMessage.findUnique({ where: { trackingToken: token } })
    if (message) {
      await recordEmailEvent({
        messageId: message.id,
        eventType: "click",
        status: "CLICKED",
        metadata: { url: destination },
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      })
    }
  }
  return NextResponse.redirect(destination)
}
