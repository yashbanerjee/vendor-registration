import { prisma } from "@/server/db"
import type { ClaimedJob } from "@/server/queue/types"

type ImportRow = { line: number; values: Record<string, string>; status: string; errors: string[] }

export async function processImportJob(job: ClaimedJob) {
  const jobId = String(job.payload.jobId || "")
  const record = await prisma.importJob.findUnique({ where: { id: jobId } })
  if (!record || record.status === "completed") return
  const rows = ((record.payload || {}) as { rows?: ImportRow[] }).rows || []
  const activate = Boolean((record.payload as { activate?: boolean } | null)?.activate)
  const origin = String((record.payload as { origin?: string } | null)?.origin || "")
  const userId = String(job.payload.userId || record.createdById || "")
  await prisma.importJob.update({ where: { id: record.id }, data: { status: "processing" } })
  const { importOneRow } = await import("@/server/handlers/import")
  const prior = (record.result || {}) as { doneLines?: number[]; successCount?: number; invitations?: { email: string; temporaryPassword?: string; emailed: boolean }[] }
  const done = new Set(prior.doneLines || [])
  let successful = prior.successCount || 0
  const errors = Array.isArray(record.errors) ? [...(record.errors as { line: number; field?: string; error: string; value?: string }[])] : []
  const invitations = [...(prior.invitations || [])]
  for (const row of rows) {
    if (row.status !== "valid" || done.has(row.line)) continue
    try {
      const result = await importOneRow(row.values, userId, origin, activate)
      done.add(row.line)
      successful += 1
      if (result.temporaryPassword) invitations.push(result)
    } catch (error) {
      errors.push({ line: row.line, field: "row", error: error instanceof Error ? error.message : "Could not import this row.", value: row.values.email })
      done.add(row.line)
    }
    if (done.size % 25 === 0) {
      await prisma.importJob.update({
        where: { id: record.id },
        data: { processed: done.size, successful, failed: errors.length, errors, result: { doneLines: [...done], successCount: successful, invitations } },
      })
    }
  }
  await prisma.importJob.update({
    where: { id: record.id },
    data: {
      status: "completed",
      processed: rows.length,
      successful,
      failed: errors.length,
      errors,
      result: { doneLines: [...done], successCount: successful, invitations },
    },
  })
}
