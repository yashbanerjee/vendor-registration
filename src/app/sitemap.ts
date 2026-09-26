import type { MetadataRoute } from "next"
import { headers } from "next/headers"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headerList = await headers()
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "localhost:3000"
  const proto = headerList.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https")
  const base = `${proto}://${host}`
  const paths = ["", "/about", "/features", "/how-it-works", "/faq", "/contact", "/privacy", "/terms", "/login"]
  return paths.map((path) => ({
    url: `${base}${path || "/"}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.6,
  }))
}
