import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"
import {
  changeLocalIdentityPassword,
  loginWithIdentity,
  provisionLocalIdentity,
  setLocalIdentityPassword,
  setLocalIdentityStatus,
} from "@/server/identity/local"

const MANAGED = "identity-managed"

export function managedPassword() {
  return MANAGED
}

async function remoteBase() {
  const row = await prisma.systemSetting.findUnique({ where: { key: "identity.baseUrl" } })
  const value = typeof row?.value === "string" ? row.value.trim() : ""
  if (!value || value.includes("127.0.0.1") || value.includes("localhost")) return ""
  return value
}

async function endpoint() {
  const [base, key] = await Promise.all([
    remoteBase(),
    prisma.systemSetting.findUnique({ where: { key: "identity.serviceKey" } }),
  ])
  return {
    base: base || "http://127.0.0.1:4010",
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
  if (!(await remoteBase())) return loginWithIdentity(email, password, code)
  const result = await identityRequest<{ identityUserId: string }>("/auth/login", { email, password, code })
  return { identityUserId: result.identityUserId }
}

export async function provisionIdentity(email: string, password: string) {
  if (!(await remoteBase())) return provisionLocalIdentity(email, password)
  const result = await identityRequest<{ identityUserId: string }>("/internal/accounts", { email, password })
  return result.identityUserId
}

export async function identityChangePassword(identityUserId: string, currentPassword: string, password: string) {
  if (!(await remoteBase())) return changeLocalIdentityPassword(identityUserId, currentPassword, password)
  await identityRequest("/internal/password", { identityUserId, currentPassword, password })
}

export async function identitySetPassword(identityUserId: string, password: string) {
  if (!(await remoteBase())) return setLocalIdentityPassword(identityUserId, password)
  await identityRequest("/internal/set-password", { identityUserId, password })
}

export async function identitySetStatus(identityUserId: string, status: string) {
  if (!(await remoteBase())) return setLocalIdentityStatus(identityUserId, status)
  await identityRequest("/internal/status", { identityUserId, status })
}
