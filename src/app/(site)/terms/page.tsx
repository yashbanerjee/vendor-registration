import type { Metadata } from "next"
import { safeCompany } from "@/components/marketing/site-chrome"
export const metadata: Metadata = { title: "Terms" }
export default async function TermsPage() {
  const company = await safeCompany()
  return <main className="mx-auto max-w-3xl whitespace-pre-wrap px-4 py-16"><h1 className="text-3xl font-medium">Terms</h1><p className="mt-6 text-muted-foreground">{company?.terms || "The terms have not been published yet."}</p></main>
}
