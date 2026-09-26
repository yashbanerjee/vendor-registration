import { prisma } from "@/server/db"
import { enqueue } from "@/server/queue"

export async function routeDomainEvent(eventType: string, payload: Record<string, unknown>, eventId: string) {
  if (eventType === "NotificationRequested") {
    await enqueue({
      queue: "notification",
      name: "in-app",
      payload,
      idempotencyKey: `notification:${eventId}`,
    })
    return
  }
  if (eventType === "ImportRequested") {
    await enqueue({
      queue: "import",
      name: "vendors",
      payload,
      idempotencyKey: `import:${String(payload.jobId || eventId)}`,
    })
    return
  }
  if (eventType.startsWith("Approval")) {
    const organizationId = String(payload.organizationId || "")
    const admins = organizationId
      ? await prisma.user.findMany({ where: { organizationId, status: "ACTIVE", deletedAt: null, portal: "ADMIN" }, select: { id: true }, take: 25 })
      : []
    await enqueue({
      queue: "notification",
      name: "approval",
      payload: {
        ...payload,
        userIds: admins.map((item) => item.id),
        title: "Approval update",
        body: `${eventType.replace(/([A-Z])/g, " $1").trim()}`,
        type: "approval",
        link: "/admin/approvals",
      },
      idempotencyKey: `${eventType}:${String(payload.requestId || eventId)}`,
    })
    return
  }
  if (eventType === "VendorApproved" || eventType === "VendorRejected") {
    const vendorId = String(payload.vendorId || "")
    const vendor = vendorId ? await prisma.vendor.findUnique({ where: { id: vendorId }, include: { users: { where: { deletedAt: null } } } }) : null
    if (!vendor) return
    const { queueEmail, providerConfigured } = await import("@/server/email/queue-mail")
    if (!(await providerConfigured())) return
    for (const user of vendor.users) {
      await queueEmail({
        to: user.email,
        name: user.name,
        vendorId: vendor.id,
        subject: eventType === "VendorApproved" ? `${vendor.legalName} is approved` : `${vendor.legalName} needs attention`,
        text: String(payload.note || "Open the vendor portal for the latest status."),
        category: "transactional",
        idempotencyKey: `${eventType}:${vendor.id}:${user.email}`,
      })
    }
  }
}
