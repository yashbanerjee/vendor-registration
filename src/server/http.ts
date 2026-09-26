import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { ApiError } from "@/server/errors"

export function ok(data: unknown, message = "OK", meta?: Record<string, unknown>, status = 200) {
  return NextResponse.json(
    { success: true, message, data, ...(meta ? { meta } : {}) },
    { status },
  )
}

export function fail(message: string, status = 400, errors?: unknown) {
  return NextResponse.json(
    { success: false, message, ...(errors ? { errors } : {}) },
    { status },
  )
}

export function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function handleError(error: unknown) {
  if (error instanceof ApiError) return fail(error.message, error.status, error.errors)
  if (error instanceof ZodError) {
    return fail("Please check the highlighted fields.", 422, error.flatten().fieldErrors)
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return fail("A record with this value already exists.", 409)
    if (error.code === "P2025") return fail("Record not found.", 404)
    if (error.code === "P2003") return fail("This record is linked to other data and cannot be removed.", 409)
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return fail("The database is unavailable. Check that PostgreSQL is running and DATABASE_URL is correct.", 503)
  }
  console.error(error)
  return fail("Something went wrong. Please try again.", 500)
}

export async function readJson(req: Request) {
  try {
    return await req.json()
  } catch {
    throw new ApiError(400, "Request body must be JSON.")
  }
}

export function assertSameOrigin(req: Request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return
  const origin = req.headers.get("origin")
  if (!origin) return
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host")
  if (!host) return
  let originHost = ""
  try {
    originHost = new URL(origin).host
  } catch {
    throw new ApiError(403, "Cross-origin request blocked.")
  }
  if (originHost !== host) throw new ApiError(403, "Cross-origin request blocked.")
}

export function clientMeta(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined
  const userAgent = req.headers.get("user-agent") || undefined
  return { ip, userAgent }
}

const buckets = new Map<string, { count: number; reset: number }>()

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return
  }
  bucket.count += 1
  if (bucket.count > limit) {
    throw new ApiError(429, "Too many requests. Please try again shortly.")
  }
}

export function listQuery(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 20) || 20))
  const q = (url.searchParams.get("q") || "").trim()
  const sort = url.searchParams.get("sort") || "createdAt"
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc"
  const status = (url.searchParams.get("status") || "").trim()
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const vendorId = (url.searchParams.get("vendorId") || "").trim()
  const eventId = (url.searchParams.get("eventId") || "").trim()
  const category = (url.searchParams.get("category") || "").trim()
  return {
    page,
    pageSize,
    q,
    sort,
    dir: dir as "asc" | "desc",
    status,
    from,
    to,
    vendorId,
    eventId,
    category,
    skip: (page - 1) * pageSize,
  }
}

export function metaOf(total: number, page: number, pageSize: number) {
  return { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}

export function parseDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) throw new ApiError(422, "One of the dates is invalid.")
  return date
}

export function allowedSort<T extends string>(value: string, allow: readonly T[], fallback: T): T {
  return (allow as readonly string[]).includes(value) ? (value as T) : fallback
}

export function fileResponse(body: Uint8Array | Buffer, type: string, filename: string) {
  const copy = Uint8Array.from(body)
  return new NextResponse(copy.buffer, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
