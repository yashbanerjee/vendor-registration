import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"
import { publishEvent } from "@/server/events/outbox"
import type { PublicUser } from "@/lib/types"

function inRange(amount: number, min: { toNumber?: () => number } | number | null, max: { toNumber?: () => number } | number | null) {
  const low = min == null ? null : typeof min === "number" ? min : Number(min)
  const high = max == null ? null : typeof max === "number" ? max : Number(max)
  if (low != null && amount < low) return false
  if (high != null && amount >= high) return false
  return true
}

export async function startApproval(input: { organizationId: string; module: string; entityType: string; entityId: string; vendorId?: string | null; amount?: number }) {
  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { module: input.module, active: true, OR: [{ organizationId: input.organizationId }, { organizationId: null }] },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
    orderBy: { organizationId: "desc" },
  })
  if (!workflow) return null
  const amount = input.amount ?? 0
  const steps = workflow.steps.filter((step) => inRange(amount, step.minAmount, step.maxAmount))
  const chosen = steps.length ? steps : workflow.steps
  if (!chosen.length) return null
  const existing = await prisma.approvalRequest.findFirst({ where: { entityType: input.entityType, entityId: input.entityId, status: "PENDING" } })
  if (existing) return existing
  const request = await prisma.approvalRequest.create({
    data: {
      workflowId: workflow.id,
      organizationId: input.organizationId,
      vendorId: input.vendorId || null,
      entityType: input.entityType,
      entityId: input.entityId,
      amount,
      status: "PENDING",
      currentStep: workflow.steps.findIndex((step) => step.id === chosen[0].id),
    },
  })
  await publishEvent({
    eventType: "ApprovalAssigned",
    aggregateType: input.entityType,
    aggregateId: input.entityId,
    payload: { requestId: request.id, organizationId: input.organizationId, module: input.module, amount },
  })
  return request
}

export async function decideApproval(user: PublicUser, requestId: string, action: "APPROVE" | "REJECT" | "CHANGES", note?: string) {
  const request = await prisma.approvalRequest.findUnique({ where: { id: requestId }, include: { workflow: { include: { steps: { orderBy: { sortOrder: "asc" } } } } } })
  if (!request || request.status !== "PENDING") throw new ApiError(404, "Approval is not pending.")
  if (user.organizationId && request.organizationId && user.organizationId !== request.organizationId) {
    throw new ApiError(403, "That approval belongs to another organization.")
  }
  const step = request.workflow.steps[request.currentStep]
  if (!step) throw new ApiError(409, "This approval has no current step.")
  const delegated = await prisma.approvalDelegation.findFirst({
    where: { organizationId: request.organizationId || "", toUserId: user.id, active: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
  })
  const roleOk = !step.roleSlug || user.role?.slug === step.roleSlug || user.isOrgAdmin || Boolean(delegated)
  const teamOk = !step.teamCode || user.isOrgAdmin || user.teamIds.length > 0
  if (!roleOk || !teamOk) throw new ApiError(403, "This approval is assigned to another role or team.")
  if (step.teamCode && !user.isOrgAdmin) {
    const team = await prisma.team.findFirst({ where: { organizationId: request.organizationId || "", code: step.teamCode } })
    if (team && !user.teamIds.includes(team.id) && !delegated) throw new ApiError(403, "This approval is assigned to another team.")
  }
  const status = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED"
  await prisma.approvalAction.create({
    data: { requestId: request.id, stepId: step.id, actorId: user.id, action: status, note },
  })
  const nextIndex = request.currentStep + 1
  const more = action === "APPROVE" && request.workflow.steps[nextIndex] && inRange(Number(request.amount || 0), request.workflow.steps[nextIndex].minAmount, request.workflow.steps[nextIndex].maxAmount)
  await prisma.approvalRequest.update({
    where: { id: request.id },
    data: more ? { currentStep: nextIndex } : { status },
  })
  await publishEvent({
    eventType: action === "APPROVE" && more ? "ApprovalAssigned" : action === "APPROVE" ? "ApprovalCompleted" : action === "REJECT" ? "ApprovalRejected" : "ApprovalChangesRequested",
    aggregateType: request.entityType,
    aggregateId: request.entityId,
    payload: { requestId: request.id, organizationId: request.organizationId, actorId: user.id, note: note || "" },
  })
  if (!more && request.entityType === "invoice") {
    await prisma.invoice.update({
      where: { id: request.entityId },
      data: { status: action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED" },
    })
  }
  return prisma.approvalRequest.findUnique({ where: { id: request.id }, include: { actions: { orderBy: { createdAt: "asc" } }, workflow: { include: { steps: { orderBy: { sortOrder: "asc" } } } } } })
}

export async function scanApprovalReminders() {
  const row = await prisma.systemSetting.findUnique({ where: { key: "approval.reminders" } })
  const policy = (row?.value || { reminderHours: [24, 48], escalateHours: 72 }) as { reminderHours?: number[]; escalateHours?: number }
  const first = policy.reminderHours?.[0] || 24
  const cutoff = new Date(Date.now() - first * 60 * 60 * 1000)
  const pending = await prisma.approvalRequest.findMany({ where: { status: "PENDING", updatedAt: { lt: cutoff } }, take: 20 })
  for (const request of pending) {
    await publishEvent({
      eventType: "ApprovalReminderDue",
      aggregateType: request.entityType,
      aggregateId: request.entityId,
      payload: { requestId: request.id, organizationId: request.organizationId },
    })
    await prisma.approvalRequest.update({ where: { id: request.id }, data: { updatedAt: new Date() } })
  }
}
