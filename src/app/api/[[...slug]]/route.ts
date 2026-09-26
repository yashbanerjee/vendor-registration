import { dispatch } from "@/server/dispatch"
import { handleError } from "@/server/http"

async function handle(req: Request, context: { params: Promise<{ slug?: string[] }> }) {
  try {
    const { slug = [] } = await context.params
    return await dispatch(req, slug, req.method)
  } catch (error) {
    return handleError(error)
  }
}

export const GET = handle
export const POST = handle
export const PATCH = handle
export const PUT = handle
export const DELETE = handle
