import { prisma } from "@/server/db"
import { emailPolicy } from "@/server/email/settings"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const message = await prisma.emailMessage.findUnique({ where: { trackingToken: token } })
  const body = message
    ? `<main style="font-family:Segoe UI,sans-serif;max-width:32rem;margin:4rem auto"><h1>Marketing email</h1><p>This stops marketing announcements for ${message.recipientEmail}. Account, approval, purchase order, and compliance messages still arrive.</p><form method="post"><button type="submit">Unsubscribe from marketing</button></form></main>`
    : `<main style="font-family:Segoe UI,sans-serif;max-width:32rem;margin:4rem auto"><h1>Link not found</h1></main>`
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}

export async function POST(_req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const policy = await emailPolicy()
  const message = await prisma.emailMessage.findUnique({ where: { trackingToken: token } })
  if (message && policy.unsubscribeEnabled) {
    await prisma.emailUnsubscribe.upsert({
      where: { email_category: { email: message.recipientEmail, category: "marketing" } },
      update: {},
      create: { email: message.recipientEmail, category: "marketing" },
    })
  }
  return new Response(`<main style="font-family:Segoe UI,sans-serif;max-width:32rem;margin:4rem auto"><h1>Marketing email stopped</h1><p>Operational messages are unchanged.</p></main>`, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}
