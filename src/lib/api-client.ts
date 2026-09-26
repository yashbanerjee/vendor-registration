import type { ApiFailure, ApiSuccess } from "@/lib/types"

export class ApiClientError extends Error {
  status: number
  errors?: ApiFailure["errors"]

  constructor(message: string, status: number, errors?: ApiFailure["errors"]) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  })

  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    if (!response.ok) throw new ApiClientError("Request failed.", response.status)
    return response as T
  }

  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure
  if (!payload.success) {
    throw new ApiClientError(payload.message || "Request failed.", response.status, payload.errors)
  }
  return payload.data
}

export async function apiWithMeta<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure
  if (!payload.success) {
    throw new ApiClientError(payload.message || "Request failed.", response.status, payload.errors)
  }
  return payload
}
