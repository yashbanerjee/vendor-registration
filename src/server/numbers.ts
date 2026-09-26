import { prisma } from "@/server/db"

export async function nextCode(key: string, prefix: string) {
  return prisma.$transaction(async (tx) => {
    const settingKey = `seq.${key}`
    const existing = await tx.systemSetting.findUnique({ where: { key: settingKey } })
    const current = existing ? Number(existing.value) || 0 : 0
    const next = current + 1
    if (existing) {
      await tx.systemSetting.update({ where: { key: settingKey }, data: { value: next } })
    } else {
      await tx.systemSetting.create({
        data: { key: settingKey, value: next, group: "sequence" },
      })
    }
    const year = new Date().getFullYear()
    return `${prefix}-${year}-${String(next).padStart(4, "0")}`
  })
}
