import type { Metadata } from "next"
import { safeCompany } from "@/components/marketing/site-chrome"
import type { HomepageContent } from "@/lib/types"
export const metadata: Metadata = { title: "FAQ" }
export default async function FaqPage() {
  const company = await safeCompany()
  const faqs = ((company?.homepage || {}) as HomepageContent).faqs || []
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-display text-4xl">FAQ</h1>
      <div className="mt-8 space-y-6">
        {faqs.map((faq) => <article key={faq.q}><h2 className="text-lg font-medium">{faq.q}</h2><p className="mt-2 text-muted-foreground">{faq.a}</p></article>)}
        {faqs.length === 0 && <p className="text-muted-foreground">Questions can be edited from System Settings once the database is connected.</p>}
      </div>
    </main>
  )
}
