import ExcelJS from "exceljs"
import { z } from "zod"
import { IMPORT_HEADERS, VAT_STATUSES } from "@/lib/constants"
import { audit } from "@/server/audit"
import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"
import { authorize } from "@/server/guard"
import { clientMeta, fileResponse, ok, readJson } from "@/server/http"
import { nextCode } from "@/server/numbers"
import { openVendorAccess, saveVendorDetails } from "@/server/handlers/vendors"
import { requestOrigin } from "@/server/mail"

type ImportRow = Record<string, string>

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const source = text.replace(/^\uFEFF/, "")
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else quoted = false
      } else cell += char
    } else if (char === '"') quoted = true
    else if (char === ",") {
      row.push(cell)
      cell = ""
    } else if (char === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else if (char !== "\r") cell += char
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((item) => item.some((value) => value.trim()))
}

async function rowsFromFile(file: File): Promise<ImportRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase()
  if (ext === "csv") {
    const matrix = parseCsv(await file.text())
    return matrixToObjects(matrix)
  }
  if (ext === "xlsx" || ext === "xls") {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never)
    const sheet = workbook.worksheets[0]
    if (!sheet) throw new ApiError(422, "The workbook has no sheets.")
    const matrix: string[][] = []
    sheet.eachRow((row) => {
      const values = row.values as unknown[]
      matrix.push(values.slice(1).map((value) => (value == null ? "" : String(value))))
    })
    return matrixToObjects(matrix)
  }
  throw new ApiError(415, "Upload a CSV or Excel file.")
}

function matrixToObjects(matrix: string[][]) {
  if (matrix.length < 2) throw new ApiError(422, "The file needs a header row and at least one vendor.")
  const headers = matrix[0].map((header) => header.trim())
  return matrix.slice(1).map((line) => {
    const record: ImportRow = {}
    headers.forEach((header, index) => {
      record[header] = (line[index] || "").trim()
    })
    return record
  })
}

async function classify(rows: ImportRow[]) {
  const [categories, services, terms, emirates, existing, accounts] = await Promise.all([
    prisma.vendorCategory.findMany({ where: { active: true } }),
    prisma.vendorService.findMany({ where: { active: true } }),
    prisma.paymentTerm.findMany({ where: { active: true } }),
    prisma.emirate.findMany({ where: { active: true } }),
    prisma.vendor.findMany({ where: { deletedAt: null }, select: { tradeLicenseNumber: true, contacts: { select: { email: true } } } }),
    prisma.user.findMany({ where: { deletedAt: null }, select: { email: true } }),
  ])
  const licenses = new Set(existing.map((vendor) => vendor.tradeLicenseNumber).filter(Boolean) as string[])
  const emails = new Set([
    ...existing.flatMap((vendor) => vendor.contacts.map((contact) => contact.email?.toLowerCase()).filter(Boolean) as string[]),
    ...accounts.map((account) => account.email.toLowerCase()),
  ])
  const seenLicenses = new Set<string>()
  const seenEmails = new Set<string>()
  const preview = rows.map((values, index) => {
    const errors: string[] = []
    if (!values.email) errors.push("Email is required.")
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.push("Email is invalid.")
    else if (!values.companyName) values.companyName = values.email
    if (values.vatStatus && !VAT_STATUSES.includes(values.vatStatus.toUpperCase().replace(/\s+/g, "_"))) {
      errors.push("VAT status must be REGISTERED, NOT_REGISTERED, EXEMPT, or PENDING.")
    }
    if (values.emirate && !emirates.some((item) => item.name.toLowerCase() === values.emirate.toLowerCase())) {
      errors.push("Emirate is not in the configured list.")
    }
    if (values.vendorCategory && !categories.some((item) => item.name.toLowerCase() === values.vendorCategory.toLowerCase())) {
      errors.push("Vendor category was not found.")
    }
    if (values.paymentTerms && !terms.some((item) => item.name.toLowerCase() === values.paymentTerms.toLowerCase())) {
      errors.push("Payment terms were not found.")
    }
    const serviceNames = values.services ? values.services.split("|").map((item) => item.trim()).filter(Boolean) : []
    for (const name of serviceNames) {
      if (!services.some((item) => item.name.toLowerCase() === name.toLowerCase())) errors.push(`Service “${name}” was not found.`)
    }
    let status: "valid" | "invalid" | "duplicate" = errors.length ? "invalid" : "valid"
    const license = values.tradeLicenseNumber
    const email = values.email?.toLowerCase()
    if (license && (licenses.has(license) || seenLicenses.has(license))) {
      status = "duplicate"
      errors.push("Trade license number already exists.")
    }
    if (email && (emails.has(email) || seenEmails.has(email))) {
      status = "duplicate"
      errors.push("Email already exists.")
    }
    if (license) seenLicenses.add(license)
    if (email) seenEmails.add(email)
    return { line: index + 2, values, errors, status }
  })
  return {
    rows: preview,
    summary: {
      total: preview.length,
      successful: preview.filter((row) => row.status === "valid").length,
      failed: preview.filter((row) => row.status !== "valid").length,
      duplicate: preview.filter((row) => row.status === "duplicate").length,
      invalid: preview.filter((row) => row.status === "invalid").length,
    },
  }
}

export async function importTemplate() {
  await authorize({ module: "vendors", action: "CREATE", feature: "bulkImport", portals: ["SUPER_ADMIN", "ADMIN"] })
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Vendors")
  sheet.addRow([...IMPORT_HEADERS])
  sheet.addRow(["Fictitious Catering LLC", "Fictitious Catering", "TL-000000", "Department of Economy and Tourism", "Catering", "Catering", "Banquet service", "Amina Noor", "amina@example.com", "+971500000000", "Dubai", "Business Bay", "", "NOT_REGISTERED", "Net 30", "Example Bank", "AE070331234567890123456", "Fictitious Catering LLC"])
  sheet.getRow(1).font = { bold: true }
  const csv = ["\uFEFF" + IMPORT_HEADERS.join(",")]
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  return { xlsx: buffer, csv: csv.join("\n") }
}

export async function importTemplateResponse(req: Request) {
  const file = await importTemplate()
  const format = new URL(req.url).searchParams.get("format")
  if (format === "csv") return fileResponse(Buffer.from(file.csv), "text/csv; charset=utf-8", "vendor-import-template.csv")
  return fileResponse(Buffer.from(file.xlsx), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "vendor-import-template.xlsx")
}

export async function importPreview(req: Request) {
  await authorize({ module: "vendors", action: "CREATE", feature: "bulkImport", portals: ["SUPER_ADMIN", "ADMIN"] })
  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) throw new ApiError(400, "Choose a CSV or Excel file.")
  if (file.size > 5 * 1024 * 1024) throw new ApiError(413, "Import files must be 5 MB or smaller.")
  const rows = await rowsFromFile(file)
  if (rows.length > 1000) throw new ApiError(422, "Import up to 1,000 rows at a time.")
  return ok(await classify(rows), "Import preview is ready.")
}

export async function importCommit(req: Request) {
  const user = await authorize({ module: "vendors", action: "CREATE", feature: "bulkImport", portals: ["SUPER_ADMIN", "ADMIN"] })
  const body = z
    .object({
      fileName: z.string().default("import"),
      activate: z.boolean().optional(),
      rows: z.array(z.record(z.string(), z.string())).max(1000),
    })
    .parse(await readJson(req))
  const preview = await classify(body.rows)
  let successful = 0
  const errors: { line: number; errors: string[] }[] = []
  const invitations: { email: string; temporaryPassword?: string; emailed: boolean }[] = []
  for (const row of preview.rows) {
    if (row.status !== "valid") {
      errors.push({ line: row.line, errors: row.errors })
      continue
    }
    try {
      const category = row.values.vendorCategory
        ? await prisma.vendorCategory.findFirst({ where: { name: { equals: row.values.vendorCategory, mode: "insensitive" } } })
        : null
      const serviceNames = row.values.services ? row.values.services.split("|").map((item) => item.trim()).filter(Boolean) : []
      const services = serviceNames.length
        ? await prisma.vendorService.findMany({ where: { name: { in: serviceNames, mode: "insensitive" } } })
        : []
      const term = row.values.paymentTerms
        ? await prisma.paymentTerm.findFirst({ where: { name: { equals: row.values.paymentTerms, mode: "insensitive" } } })
        : null
      const vendor = await prisma.vendor.create({
        data: { vendorCode: await nextCode("vendor", "V"), legalName: row.values.companyName, status: "DRAFT" },
      })
      await saveVendorDetails(
        vendor.id,
        {
          legalName: row.values.companyName,
          tradeName: row.values.tradeName || null,
          tradeLicenseNumber: row.values.tradeLicenseNumber || null,
          licenseAuthority: row.values.issuingAuthority || null,
          businessActivity: row.values.businessActivity || null,
          emirate: row.values.emirate || null,
          address: row.values.address || null,
          trn: row.values.trn || null,
          vatStatus: row.values.vatStatus ? row.values.vatStatus.toUpperCase().replace(/\s+/g, "_") : null,
          bankName: row.values.bankName || null,
          iban: row.values.iban || null,
          accountName: row.values.accountName || null,
          paymentTermId: term?.id || null,
          categoryIds: category ? [category.id] : [],
          serviceIds: services.map((service) => service.id),
          contact: row.values.contactPerson
            ? { name: row.values.contactPerson, email: row.values.email || "", phone: row.values.phone || "" }
            : undefined,
        },
        user.id,
      )
      const access = await openVendorAccess(vendor.id, { email: row.values.email, name: row.values.contactPerson || row.values.companyName, phone: row.values.phone }, requestOrigin(req))
      if (body.activate) {
        await prisma.vendor.update({ where: { id: vendor.id }, data: { status: "ACTIVE", approvedAt: new Date() } })
      }
      invitations.push({ email: access.email, temporaryPassword: access.temporaryPassword, emailed: access.emailed })
      successful += 1
    } catch (error) {
      errors.push({ line: row.line, errors: [error instanceof Error ? error.message : "Could not import this row."] })
    }
  }
  const job = await prisma.importJob.create({
    data: {
      fileName: body.fileName,
      status: "completed",
      total: preview.summary.total,
      successful,
      failed: preview.summary.total - successful,
      duplicates: preview.summary.duplicate,
      invalid: preview.summary.invalid,
      errors,
      createdById: user.id,
    },
  })
  await audit({
    userId: user.id,
    action: "Imported vendors",
    module: "vendors",
    recordId: job.id,
    recordLabel: body.fileName,
    newValue: { successful, failed: job.failed },
    ...clientMeta(req),
  })
  return ok({ job, errors, invitations }, "Import finished.")
}

export async function listImportJobs() {
  await authorize({ module: "vendors", action: "VIEW", feature: "bulkImport", portals: ["SUPER_ADMIN", "ADMIN"] })
  const jobs = await prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 20 })
  return ok(jobs, "Import history loaded.")
}
