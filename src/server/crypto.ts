import { createCipheriv, createDecipheriv, randomBytes } from "crypto"
import { prisma } from "@/server/db"

async function masterKey() {
  const keyName = "security.encryptionKey"
  const existing = await prisma.systemSetting.findUnique({ where: { key: keyName } })
  if (existing && typeof existing.value === "string" && existing.value.length === 64) {
    return Buffer.from(existing.value, "hex")
  }
  const key = randomBytes(32).toString("hex")
  await prisma.systemSetting.upsert({
    where: { key: keyName },
    update: { value: key, isSecret: true },
    create: { key: keyName, value: key, group: "security", isSecret: true },
  })
  return Buffer.from(key, "hex")
}

export async function encryptSecret(plain: string) {
  const key = await masterKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("hex")}.${tag.toString("hex")}.${encrypted.toString("hex")}`
}

export async function decryptSecret(payload: string) {
  const [ivHex, tagHex, dataHex] = payload.split(".")
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid secret payload")
  const key = await masterKey()
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"))
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()])
  return decrypted.toString("utf8")
}
