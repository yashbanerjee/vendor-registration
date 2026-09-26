import { z } from "zod"
import { audit } from "@/server/audit"
import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"
import { authorize } from "@/server/guard"
import { clientMeta, ok, readJson } from "@/server/http"
import { managedPassword, provisionIdentity, identitySetStatus } from "@/server/identity-client"
import { decideApproval } from "@/server/approval/engine"
import { publishEvent } from "@/server/events/outbox"

const passwordSchema = z.string().min(8).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/)

export async function platformSummary() {
  await authorize({ module: "settings", action: "VIEW", portals: ["SUPER_ADMIN"] })
  const [organizations, admins, queues] = await Promise.all([
    prisma.organization.count(),
    prisma.organizationMembership.count({ where: { isOrgAdmin: true } }),
    prisma.queueJob.count({ where: { status: { in: ["QUEUED", "DEAD"] } } }),
  ])
  return ok({ organizations, admins, queuedJobs: queues }, "Platform summary loaded.")
}

export async function listOrganizations() {
  await authorize({ module: "settings", action: "VIEW", portals: ["SUPER_ADMIN"] })
  const rows = await prisma.organization.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true, teams: true } } } })
  return ok(rows, "Organizations loaded.")
}

export async function saveOrganization(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "settings", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN"] })
  const body = z.object({ name: z.string().min(2), code: z.string().min(2).max(20), status: z.enum(["ACTIVE", "SUSPENDED"]).optional() }).parse(await readJson(req))
  const row = params.id
    ? await prisma.organization.update({ where: { id: params.id }, data: { name: body.name, status: body.status || "ACTIVE" } })
    : await prisma.organization.create({ data: { name: body.name, code: body.code.toUpperCase(), status: body.status || "ACTIVE" } })
  await audit({ userId: user.id, action: params.id ? "Updated organization" : "Created organization", module: "settings", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(row, "Organization saved.")
}

export async function listOrgAdmins() {
  await authorize({ module: "users", action: "VIEW", portals: ["SUPER_ADMIN"] })
  const rows = await prisma.user.findMany({
    where: { deletedAt: null, memberships: { some: { isOrgAdmin: true } } },
    select: { id: true, name: true, email: true, phone: true, status: true, identityUserId: true, organizationId: true, createdAt: true, lastLoginAt: true, organization: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  })
  return ok(rows, "Admins loaded.")
}

export async function saveOrgAdmin(req: Request, params: Record<string, string>) {
  const actor = await authorize({ module: "users", action: params.id ? "EDIT" : "CREATE", portals: ["SUPER_ADMIN"] })
  const body = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().optional(),
    organizationId: z.string(),
    password: passwordSchema.optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  }).parse(await readJson(req))
  const role = await prisma.role.findUnique({ where: { slug: "admin" } })
  if (!role) throw new ApiError(409, "The organization admin role is not ready.")
  if (params.id) {
    const current = await prisma.user.findUnique({ where: { id: params.id } })
    if (!current) throw new ApiError(404, "Admin not found.")
    const row = await prisma.user.update({
      where: { id: params.id },
      data: { name: body.name, phone: body.phone, status: body.status || current.status, organizationId: body.organizationId },
    })
    if (body.status && current.identityUserId) await identitySetStatus(current.identityUserId, body.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED")
    await audit({ userId: actor.id, action: "Updated organization admin", module: "users", recordId: row.id, recordLabel: row.email, ...clientMeta(req) })
    return ok({ id: row.id }, "Admin updated.")
  }
  if (!body.password) throw new ApiError(422, "A password is required for a new admin.")
  const identityUserId = await provisionIdentity(body.email, body.password)
  const row = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase(),
      phone: body.phone,
      passwordHash: managedPassword(),
      identityUserId,
      portal: "ADMIN",
      roleId: role.id,
      organizationId: body.organizationId,
      status: "ACTIVE",
    },
  })
  await prisma.organizationMembership.create({ data: { userId: row.id, organizationId: body.organizationId, isOrgAdmin: true } })
  await audit({ userId: actor.id, action: "Created organization admin", module: "users", recordId: row.id, recordLabel: row.email, ...clientMeta(req) })
  return ok({ id: row.id, identityUserId }, "Admin created.", undefined, 201)
}

export async function setOrgAdminStatus(req: Request, params: Record<string, string>) {
  const actor = await authorize({ module: "users", action: "EDIT", portals: ["SUPER_ADMIN"] })
  const body = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) }).parse(await readJson(req))
  const row = await prisma.user.update({ where: { id: params.id }, data: { status: body.status } })
  if (row.identityUserId) await identitySetStatus(row.identityUserId, body.status)
  await audit({ userId: actor.id, action: body.status === "ACTIVE" ? "Activated admin" : "Deactivated admin", module: "users", recordId: row.id, recordLabel: row.email, ...clientMeta(req) })
  return ok({ id: row.id, status: row.status }, "Admin status updated.")
}

export async function listTeams() {
  const user = await authorize({ module: "teams", action: "VIEW", portals: ["ADMIN"] })
  if (!user.organizationId) throw new ApiError(403, "This account is not assigned to an organization.")
  const teamFilter = user.isOrgAdmin ? {} : { id: { in: user.teamAdminIds.length ? user.teamAdminIds : user.teamIds } }
  const rows = await prisma.team.findMany({
    where: { organizationId: user.organizationId, ...teamFilter },
    include: { memberships: { include: { user: { select: { id: true, name: true, email: true, status: true } } } } },
    orderBy: { name: "asc" },
  })
  return ok(rows, "Teams loaded.")
}

export async function saveTeam(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "teams", action: params.id ? "EDIT" : "CREATE", portals: ["ADMIN"] })
  if (!user.isOrgAdmin) throw new ApiError(403, "Only an organization admin can create teams.")
  if (!user.organizationId) throw new ApiError(403, "This account is not assigned to an organization.")
  const body = z.object({ name: z.string().min(2), code: z.string().min(2).max(20), description: z.string().optional(), status: z.enum(["ACTIVE", "SUSPENDED"]).optional() }).parse(await readJson(req))
  const row = params.id
    ? await prisma.team.update({ where: { id: params.id }, data: { name: body.name, description: body.description, status: body.status || "ACTIVE" } })
    : await prisma.team.create({ data: { organizationId: user.organizationId, name: body.name, code: body.code.toUpperCase(), description: body.description, status: body.status || "ACTIVE" } })
  await audit({ userId: user.id, action: "Saved team", module: "teams", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(row, "Team saved.")
}

export async function saveTeamMember(req: Request, params: Record<string, string>) {
  const actor = await authorize({ module: "teams", action: "EDIT", portals: ["ADMIN"] })
  const body = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().optional(),
    roleId: z.string(),
    isTeamAdmin: z.boolean().optional(),
    password: passwordSchema.optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  }).parse(await readJson(req))
  const team = await prisma.team.findFirst({ where: { id: params.id, organizationId: actor.organizationId || "" } })
  if (!team) throw new ApiError(404, "Team not found.")
  if (!actor.isOrgAdmin && !actor.teamAdminIds.includes(team.id)) throw new ApiError(403, "You can manage users only for your own team.")
  const email = body.email.toLowerCase()
  let member = await prisma.user.findUnique({ where: { email } })
  if (!member) {
    if (!body.password) throw new ApiError(422, "A password is required for a new user.")
    const identityUserId = await provisionIdentity(email, body.password)
    member = await prisma.user.create({
      data: {
        name: body.name,
        email,
        phone: body.phone,
        passwordHash: managedPassword(),
        identityUserId,
        portal: "ADMIN",
        roleId: body.roleId,
        organizationId: team.organizationId,
        status: "ACTIVE",
      },
    })
  } else {
    if (member.organizationId && member.organizationId !== team.organizationId) throw new ApiError(403, "That user belongs to another organization.")
    member = await prisma.user.update({ where: { id: member.id }, data: { name: body.name, phone: body.phone, roleId: body.roleId, organizationId: team.organizationId, status: body.status || member.status } })
  }
  await prisma.teamMembership.upsert({
    where: { userId_teamId: { userId: member.id, teamId: team.id } },
    update: { isTeamAdmin: Boolean(body.isTeamAdmin) },
    create: { userId: member.id, teamId: team.id, isTeamAdmin: Boolean(body.isTeamAdmin) },
  })
  await audit({ userId: actor.id, action: "Saved team member", module: "teams", recordId: member.id, recordLabel: member.email, ...clientMeta(req) })
  return ok({ id: member.id }, "Team member saved.")
}

export async function listApprovalInbox() {
  const user = await authorize({ module: "approvals", action: "VIEW", portals: ["ADMIN"] })
  const rows = await prisma.approvalRequest.findMany({
    where: { organizationId: user.organizationId || "", status: "PENDING" },
    include: { workflow: { include: { steps: { orderBy: { sortOrder: "asc" } } } }, vendor: { select: { legalName: true } }, actions: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
  return ok(rows, "Approvals loaded.")
}

export async function actOnApproval(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "approvals", action: "APPROVE", portals: ["ADMIN"] })
  const body = z.object({ action: z.enum(["APPROVE", "REJECT", "CHANGES"]), note: z.string().max(2000).optional() }).parse(await readJson(req))
  const row = await decideApproval(user, params.id, body.action, body.note)
  await audit({ userId: user.id, action: `Approval ${body.action.toLowerCase()}`, module: "approvals", recordId: params.id, ...clientMeta(req) })
  return ok(row, "Approval updated.")
}

export async function saveWorkflow(req: Request) {
  const user = await authorize({ module: "approvals", action: "EDIT", portals: ["ADMIN"] })
  if (!user.isOrgAdmin) throw new ApiError(403, "Only an organization admin can edit approval workflows.")
  const body = z.object({
    name: z.string().min(2),
    module: z.string().min(2),
    steps: z.array(z.object({
      name: z.string().min(2),
      roleSlug: z.string().optional(),
      teamCode: z.string().optional(),
      minAmount: z.number().optional(),
      maxAmount: z.number().optional(),
    })).min(1),
  }).parse(await readJson(req))
  const workflow = await prisma.approvalWorkflow.create({
    data: {
      name: body.name,
      module: body.module,
      organizationId: user.organizationId,
      active: true,
      steps: { create: body.steps.map((step, index) => ({ name: step.name, sortOrder: index, roleSlug: step.roleSlug, teamCode: step.teamCode, minAmount: step.minAmount, maxAmount: step.maxAmount })) },
    },
    include: { steps: true },
  })
  return ok(workflow, "Workflow saved.", undefined, 201)
}

export async function saveDelegation(req: Request) {
  const user = await authorize({ module: "approvals", action: "EDIT", portals: ["ADMIN"] })
  const body = z.object({
    toUserId: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    reason: z.string().optional(),
  }).parse(await readJson(req))
  const row = await prisma.approvalDelegation.create({
    data: { organizationId: user.organizationId || "", fromUserId: user.id, toUserId: body.toUserId, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), reason: body.reason },
  })
  await publishEvent({ eventType: "ApprovalDelegated", aggregateType: "user", aggregateId: user.id, payload: { delegationId: row.id, toUserId: body.toUserId } })
  return ok(row, "Delegation saved.", undefined, 201)
}
