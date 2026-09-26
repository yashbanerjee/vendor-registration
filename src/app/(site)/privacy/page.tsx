import type { Metadata } from "next"
import { safeCompany } from "@/components/marketing/site-chrome"
export const metadata: Metadata = { title: "Privacy" }
export default async function PrivacyPage() {
  const company = await safeCompany()
  return <main className="mx-auto max-w-3xl whitespace-pre-wrap px-4 py-16"><h1 className="text-3xl font-medium">Privacy</h1><p className="mt-6 text-muted-foreground">{company?.privacyPolicy || "The privacy text has not been published yet."}</p></main>
}
