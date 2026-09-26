import { Prisma } from "@prisma/client"
import QRCode from "qrcode"
import { z } from "zod"
import { audit } from "@/server/audit"
import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"
import { authorize, scopeVendor } from "@/server/guard"
import { businessScope } from "@/server/tenant"
import { clientMeta, listQuery, metaOf, ok, parseDate, readJson, toPlain } from "@/server/http"
import { nextCode } from "@/server/numbers"
import { notifyStaff, notifyVendorUsers } from "@/server/notify"

export async function listTasks(req: Request) {
  const user = await authorize({ module: "tasks", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const vendorId = scopeVendor(user, query.vendorId)
  const where: Prisma.TaskWhereInput = {
    ...businessScope(user),
    ...(vendorId ? { vendorId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.eventId ? { eventId: query.eventId } : {}),
    ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      include: { vendor: { select: { legalName: true } }, event: { select: { name: true } }, assignee: { select: { name: true } }, comments: { take: 5, orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Tasks loaded.", metaOf(total, query.page, query.pageSize))
}

export async function saveTask(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "tasks", action: params.id ? "EDIT" : "CREATE" })
  const body = z
    .object({
      title: z.string().min(2),
      description: z.string().optional(),
      vendorId: z.string().nullable().optional(),
      eventId: z.string().nullable().optional(),
      assigneeId: z.string().nullable().optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
      dueDate: z.string().optional(),
      status: z.enum(["PENDING", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "COMPLETED", "REJECTED"]).optional(),
      fileAssetId: z.string().optional(),
    })
    .parse(await readJson(req))
  if (user.portal === "VENDOR") {
    body.vendorId = user.vendorId
    if (body.status && !["IN_PROGRESS", "SUBMITTED"].includes(body.status)) delete body.status
  }
  const data = {
    title: body.title,
    description: body.description,
    vendorId: body.vendorId || null,
    eventId: body.eventId || null,
    assigneeId: user.portal === "VENDOR" ? undefined : body.assigneeId || null,
    priority: body.priority || "MEDIUM",
    dueDate: parseDate(body.dueDate),
    status: body.status || "PENDING",
    fileAssetId: body.fileAssetId,
    organizationId: user.organizationId,
  }
  const row = params.id ? await prisma.task.update({ where: { id: params.id }, data }) : await prisma.task.create({ data })
  if (row.vendorId) await notifyVendorUsers(row.vendorId, "task", { title: row.title, status: row.status }, "/vendor/tasks")
  await audit({ userId: user.id, action: params.id ? "Updated task" : "Created task", module: "tasks", recordId: row.id, recordLabel: row.title, ...clientMeta(req) })
  return ok(toPlain(row), "Task saved.", undefined, params.id ? 200 : 201)
}

export async function commentTask(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "tasks", action: "EDIT" })
  const body = z.object({ body: z.string().min(1).max(4000) }).parse(await readJson(req))
  const task = await prisma.task.findUnique({ where: { id: params.id } })
  if (!task) throw new ApiError(404, "Task not found.")
  scopeVendor(user, task.vendorId)
  const comment = await prisma.taskComment.create({ data: { taskId: task.id, authorId: user.id, body: body.body } })
  return ok(comment, "Comment added.", undefined, 201)
}

export async function listDeliveries(req: Request) {
  const user = await authorize({ module: "deliveries", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const vendorId = scopeVendor(user, query.vendorId)
  const where: Prisma.DeliveryWhereInput = {
    ...businessScope(user),
    ...(vendorId ? { vendorId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.q ? { OR: [{ number: { contains: query.q, mode: "insensitive" } }, { material: { contains: query.q, mode: "insensitive" } }] } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.delivery.count({ where }),
    prisma.delivery.findMany({
      where,
      include: { vendor: { select: { legalName: true } }, event: { select: { name: true } }, vehicle: true, driver: true },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Deliveries loaded.", metaOf(total, query.page, query.pageSize))
}

export async function saveDelivery(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "deliveries", action: params.id ? "EDIT" : "CREATE" })
  const body = z
    .object({
      vendorId: z.string().optional(),
      eventId: z.string().nullable().optional(),
      material: z.string().min(2),
      quantity: z.number().optional(),
      expectedDate: z.string().optional(),
      actualDate: z.string().optional(),
      receiver: z.string().optional(),
      status: z.enum(["SCHEDULED", "IN_TRANSIT", "ARRIVED", "RECEIVED", "REJECTED", "CANCELLED"]).optional(),
      notes: z.string().optional(),
      plateNumber: z.string().optional(),
      vehicleType: z.string().optional(),
      driverName: z.string().optional(),
      driverMobile: z.string().optional(),
      proofAssetId: z.string().optional(),
    })
    .parse(await readJson(req))
  const vendorId = scopeVendor(user, body.vendorId) || body.vendorId
  if (!vendorId) throw new ApiError(422, "Choose a vendor.")
  let vehicleId: string | undefined
  let driverId: string | undefined
  if (body.plateNumber) {
    const vehicle = await prisma.vehicle.create({ data: { plateNumber: body.plateNumber, type: body.vehicleType, vendorId } })
    vehicleId = vehicle.id
  }
  if (body.driverName) {
    const driver = await prisma.driver.create({ data: { name: body.driverName, mobile: body.driverMobile, vendorId } })
    driverId = driver.id
  }
  const data = {
    vendorId,
    eventId: body.eventId || null,
    material: body.material,
    quantity: body.quantity,
    expectedDate: parseDate(body.expectedDate),
    actualDate: parseDate(body.actualDate),
    receiver: body.receiver,
    status: body.status || "SCHEDULED",
    notes: body.notes,
    proofAssetId: body.proofAssetId,
    vehicleId,
    driverId,
  }
  const row = params.id
    ? await prisma.delivery.update({ where: { id: params.id }, data })
    : await prisma.delivery.create({ data: { ...data, organizationId: user.organizationId, number: await nextCode("delivery", "DLV") } })
  await notifyStaff("delivery", { number: row.number, vendor: vendorId, status: row.status }, "/admin/deliveries")
  await audit({ userId: user.id, action: "Saved delivery", module: "deliveries", recordId: row.id, recordLabel: row.number, ...clientMeta(req) })
  return ok(toPlain(row), "Delivery saved.", undefined, params.id ? 200 : 201)
}

export async function listWorkforce(req: Request) {
  const user = await authorize({ module: "workforce", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const vendorId = scopeVendor(user, query.vendorId)
  const where: Prisma.VendorEmployeeWhereInput = {
    ...(vendorId ? { vendorId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.vendorEmployee.count({ where }),
    prisma.vendorEmployee.findMany({
      where,
      include: { vendor: { select: { legalName: true } }, event: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Workforce loaded.", metaOf(total, query.page, query.pageSize))
}

export async function saveWorker(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "workforce", action: params.id ? "EDIT" : "CREATE" })
  const body = z
    .object({
      vendorId: z.string().optional(),
      eventId: z.string().nullable().optional(),
      name: z.string().min(2),
      mobile: z.string().optional(),
      designation: z.string().optional(),
      idType: z.string().optional(),
      idNumber: z.string().optional(),
      shift: z.string().optional(),
      photoAssetId: z.string().optional(),
    })
    .parse(await readJson(req))
  const vendorId = scopeVendor(user, body.vendorId) || body.vendorId
  if (!vendorId) throw new ApiError(422, "Choose a vendor.")
  const data = {
    vendorId,
    eventId: body.eventId || null,
    name: body.name,
    mobile: body.mobile,
    designation: body.designation,
    idType: body.idType,
    idNumber: body.idNumber,
    shift: body.shift,
    photoAssetId: body.photoAssetId,
  }
  const row = params.id ? await prisma.vendorEmployee.update({ where: { id: params.id }, data }) : await prisma.vendorEmployee.create({ data })
  if (!params.id) await notifyStaff("task", { title: `Worker ${row.name}`, status: "pending approval" }, "/admin/workforce")
  await audit({ userId: user.id, action: "Saved worker", module: "workforce", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(toPlain(row), "Worker saved.", undefined, params.id ? 200 : 201)
}

export async function reviewWorker(req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "workforce", action: "APPROVE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z.object({ action: z.enum(["APPROVE", "REJECT"]) }).parse(await readJson(req))
  const row = await prisma.vendorEmployee.update({
    where: { id: params.id },
    data: { status: body.action === "APPROVE" ? "APPROVED" : "REJECTED" },
  })
  await notifyVendorUsers(row.vendorId, "task", { title: row.name, status: row.status }, "/vendor/workforce")
  await audit({ userId: user.id, action: body.action === "APPROVE" ? "Approved worker" : "Rejected worker", module: "workforce", recordId: row.id, recordLabel: row.name, ...clientMeta(req) })
  return ok(row, body.action === "APPROVE" ? "Worker approved." : "Worker rejected.")
}

export async function listGatePasses(req: Request) {
  const user = await authorize({ module: "gatePasses", action: "VIEW" })
  const query = listQuery(new URL(req.url))
  const vendorId = scopeVendor(user, query.vendorId)
  const where: Prisma.GatePassWhereInput = {
    ...(vendorId ? { vendorId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.q ? { OR: [{ holderName: { contains: query.q, mode: "insensitive" } }, { code: { contains: query.q, mode: "insensitive" } }] } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.gatePass.count({ where }),
    prisma.gatePass.findMany({
      where,
      include: { vendor: { select: { legalName: true } }, event: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.pageSize,
    }),
  ])
  return ok(toPlain(rows), "Gate passes loaded.", metaOf(total, query.page, query.pageSize))
}

export async function createGatePass(req: Request) {
  const user = await authorize({ module: "gatePasses", action: "CREATE", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z
    .object({
      type: z.enum(["VENDOR", "STAFF", "VEHICLE", "MATERIAL"]),
      vendorId: z.string().optional(),
      eventId: z.string().optional(),
      employeeId: z.string().optional(),
      holderName: z.string().min(2),
      plateNumber: z.string().optional(),
      validFrom: z.string().optional(),
      validTo: z.string().optional(),
    })
    .parse(await readJson(req))
  let vehicleId: string | undefined
  if (body.plateNumber) {
    const vehicle = await prisma.vehicle.create({ data: { plateNumber: body.plateNumber, vendorId: body.vendorId, type: body.type } })
    vehicleId = vehicle.id
  }
  const row = await prisma.gatePass.create({
    data: {
      code: await nextCode("gate", "GP"),
      type: body.type,
      vendorId: body.vendorId,
      eventId: body.eventId,
      employeeId: body.employeeId,
      vehicleId,
      holderName: body.holderName,
      validFrom: parseDate(body.validFrom),
      validTo: parseDate(body.validTo),
      status: "ISSUED",
    },
  })
  await audit({ userId: user.id, action: "Issued gate pass", module: "gatePasses", recordId: row.id, recordLabel: row.code, ...clientMeta(req) })
  return ok(toPlain(row), "Gate pass issued.", undefined, 201)
}

export async function gatePassQr(_req: Request, params: Record<string, string>) {
  const user = await authorize({ module: "gatePasses", action: "VIEW" })
  const pass = await prisma.gatePass.findUnique({ where: { id: params.id } })
  if (!pass) throw new ApiError(404, "Gate pass not found.")
  scopeVendor(user, pass.vendorId)
  const dataUrl = await QRCode.toDataURL(pass.code, { margin: 1, width: 320 })
  return ok({ code: pass.code, dataUrl }, "QR code ready.")
}

export async function scanGatePass(req: Request) {
  const user = await authorize({ module: "gatePasses", action: "EDIT", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z.object({ code: z.string().min(3), markUsed: z.boolean().optional() }).parse(await readJson(req))
  const pass = await prisma.gatePass.findUnique({
    where: { code: body.code.trim() },
    include: { vendor: true, event: true, vehicle: true },
  })
  if (!pass) throw new ApiError(404, "No gate pass matches this code.")
  const now = new Date()
  let valid = pass.status === "ISSUED" || pass.status === "USED"
  let reason = "Pass is valid."
  if (pass.status === "REVOKED") {
    valid = false
    reason = "This pass has been revoked."
  } else if (pass.status === "EXPIRED" || (pass.validTo && pass.validTo < now) || (pass.validFrom && pass.validFrom > now)) {
    valid = false
    reason = "This pass is outside its valid window."
    if (pass.status === "ISSUED") await prisma.gatePass.update({ where: { id: pass.id }, data: { status: "EXPIRED" } })
  }
  if (valid && body.markUsed && pass.status === "ISSUED") {
    await prisma.gatePass.update({ where: { id: pass.id }, data: { status: "USED" } })
  }
  await audit({
    userId: user.id,
    action: valid ? "Verified gate pass" : "Rejected gate pass scan",
    module: "gatePasses",
    recordId: pass.id,
    recordLabel: pass.code,
    ...clientMeta(req),
  })
  return ok({ valid, reason, pass: toPlain(pass) }, reason)
}
