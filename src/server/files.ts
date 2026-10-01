import { randomBytes } from "crypto"
import { mkdir, writeFile, readFile } from "fs/promises"
import path from "path"
import { ALLOWED_UPLOAD_EXT, ALLOWED_UPLOAD_MIME } from "@/lib/constants"
import { prisma } from "@/server/db"
import { ApiError } from "@/server/errors"

const ROOT = path.join(process.cwd(), "storage", "uploads")

function extensionOf(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  return ext.replace(/[^a-z0-9]/g, "")
}

function looksValid(buffer: Buffer, ext: string) {
  if (ext === "pdf") return buffer.subarray(0, 4).toString() === "%PDF"
  if (ext === "png") return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  if (ext === "jpg" || ext === "jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  if (ext === "webp") return buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP"
  if (ext === "xlsx" || ext === "docx") return buffer[0] === 0x50 && buffer[1] === 0x4b
  if (ext === "xls" || ext === "doc") return buffer[0] === 0xd0 && buffer[1] === 0xcf
  if (ext === "csv") {
    const sample = buffer.subarray(0, 200).toString("utf8")
    return !sample.includes("\u0000")
  }
  return false
}

export async function maxUploadBytes() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "uploads.maxMb" } })
  const mb = Number(setting?.value ?? 10)
  return (Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024
}

export async function saveUpload(file: File, options?: { public?: boolean; vendorId?: string | null; userId?: string | null }) {
  if (!file || file.size <= 0) throw new ApiError(400, "Choose a file to upload.")
  const limit = await maxUploadBytes()
  if (file.size > limit) throw new ApiError(413, "This file is larger than the configured upload limit.")
  const ext = extensionOf(file.name)
  if (!ALLOWED_UPLOAD_EXT.has(ext)) throw new ApiError(415, "This file type is not allowed.")
  const mime = file.type || "application/octet-stream"
  if (mime && mime !== "application/octet-stream" && !ALLOWED_UPLOAD_MIME.has(mime)) {
    throw new ApiError(415, "This file type is not allowed.")
  }
  const bytes = Buffer.from(await file.arrayBuffer())
  if (!looksValid(bytes, ext)) throw new ApiError(415, "The file contents do not match the expected type.")
  const storedName = `${randomBytes(16).toString("hex")}.${ext}`
  try {
    await mkdir(ROOT, { recursive: true })
    await writeFile(path.join(ROOT, storedName), bytes)
  } catch {
    // The database copy is the copy that survives a host without a persistent disk.
  }
  const asset = await prisma.fileAsset.create({
    data: {
      fileName: path.basename(file.name).slice(0, 180),
      storedName,
      mimeType: mime,
      sizeBytes: bytes.length,
      content: bytes,
      public: Boolean(options?.public),
      vendorId: options?.vendorId || null,
      createdBy: options?.userId || null,
    },
    omit: { content: true },
  })
  return asset
}

export async function readAsset(storedName: string) {
  if (!/^[a-f0-9]{32}\.[a-z0-9]+$/.test(storedName)) throw new ApiError(404, "File not found.")
  const asset = await prisma.fileAsset.findUnique({ where: { storedName }, select: { content: true } })
  if (asset?.content) return Buffer.from(asset.content)
  try {
    return await readFile(path.join(ROOT, storedName))
  } catch {
    throw new ApiError(404, "File not found.")
  }
}
