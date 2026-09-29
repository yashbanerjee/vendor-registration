import { existsSync, readFileSync } from "fs"
import { resolve } from "path"

export function loadLocalEnv() {
  const path = resolve(process.cwd(), ".env")
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const split = trimmed.indexOf("=")
    if (split < 1) continue
    const key = trimmed.slice(0, split).trim()
    let value = trimmed.slice(split + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}
