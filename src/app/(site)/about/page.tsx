import type { Metadata } from "next"
import { safeCompany } from "@/components/marketing/site-chrome"

export const metadata: Metadata = { title: "About" }

export default async function AboutPage() {
  const company = await safeCompany()
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="text-xs font-semibold text-primary">{company?.emirate || "United Arab Emirates"}</p>
      <h1 className="mt-2 text-3xl font-medium">About {company?.companyName || "this desk"}</h1>
      <p className="mt-6 text-lg leading-8 text-muted-foreground">{company?.about || "This installation helps an events, hospitality, or procurement team manage vendors. Replace this text from System Settings."}</p>
      <p className="mt-4 text-muted-foreground">{company?.address} {company?.phone ? `· ${company.phone}` : ""}</p>
    </main>
  )
}
