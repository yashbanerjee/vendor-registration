import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"

const MANAGED = "identity-managed"

export function managedPassword() {
  return MANAGED
}

async function endpoint() {
  const [base, key] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: "identity.baseUrl" } }),
    prisma.systemSetting.findUnique({ where: { key: "identity.serviceKey" } }),
  ])
  return {
    base: typeof base?.value === "string" && base.value ? base.value : "http://127.0.0.1:4010",
    key: typeof key?.value === "string" ? key.value : "",
  }
}

async function identityRequest<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const target = await endpoint()
  let response: Response
  try {
    response = await fetch(`${target.base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-service-key": target.key },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(503, "The identity service is unavailable. Sign-in is paused until it is running.")
  }
  const payload = (await response.json()) as T & { success?: boolean; message?: string }
  if (!response.ok || payload.success === false) {
    throw new ApiError(response.status || 400, payload.message || "Identity request failed.")
  }
  return payload
}

export async function identityLogin(email: string, password: string, code?: string) {
  return identityRequest<{ identityUserId: string; accessToken: string; refreshToken: string }>("/auth/login", { email, password, code })
}

export async function provisionIdentity(email: string, password: string) {
  const result = await identityRequest<{ identityUserId: string }>("/internal/accounts", { email, password })
  return result.identityUserId
}

export async function identityChangePassword(identityUserId: string, currentPassword: string, password: string) {
  await identityRequest("/internal/password", { identityUserId, currentPassword, password })
}

export async function identitySetPassword(identityUserId: string, password: string) {
  await identityRequest("/internal/set-password", { identityUserId, password })
}

export async function identitySetStatus(identityUserId: string, status: string) {
  await identityRequest("/internal/status", { identityUserId, status })
}
