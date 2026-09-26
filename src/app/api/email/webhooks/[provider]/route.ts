import { receiveWebhook } from "@/server/handlers/email"
import { handleError } from "@/server/http"

export const dynamic = "force-dynamic"

export async function POST(req: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await context.params
    return await receiveWebhook(req, { provider })
  } catch (error) {
    return handleError(error)
  }
}
