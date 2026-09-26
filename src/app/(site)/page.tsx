import Link from "next/link"
import { safeCompany } from "@/components/marketing/site-chrome"
import type { HomepageContent } from "@/lib/types"

const fallbackFeatures = [
  ["Vendor onboarding", "Collect company, licence, tax, and banking details through a guided registration or a controlled bulk import."],
  ["Compliance", "Track trade licences, VAT certificates, insurance, and expiry reminders from settings you control."],
  ["RFQ and quotations", "Invite categories, collect line-item quotes, and compare them before a purchase order is issued."],
  ["Procurement", "Turn an accepted quotation into a purchase order with VAT, payment terms, and a PDF."],
  ["Events", "Assign vendors by category, service, and scope, then follow tasks and deliveries."],
  ["Documents and contracts", "Keep licences, NDAs, and event files on the vendor record with review status."],
  ["Payments", "See invoice, advance, paid, and outstanding amounts against each order."],
  ["Performance", "Score quality, delivery, communication, and compliance after the event."],
]

const fallbackSteps = [
  ["Register", "Vendors apply online or your team imports an existing list."],
  ["Verify", "Compliance, finance, and management review the file in the order you configure."],
  ["Engage", "Assign approved vendors to events, RFQs, purchase orders, and contracts."],
  ["Deliver", "Track tasks, workforce, gate passes, and deliveries through the event."],
  ["Settle", "Review invoices, record payments, and score the vendor for the next engagement."],
]

export default async function HomePage() {
  const company = await safeCompany()
  const homepage = (company?.homepage || {}) as HomepageContent
  const headline = homepage.headline || company?.heroHeadline || "Manage Your Entire Vendor Network in One Place"
  const sub = homepage.subheadline || company?.heroSubtext || "Onboard suppliers, keep documents current, and run work from the first RFQ through payment."
  const features = homepage.features?.length ? homepage.features : fallbackFeatures.map(([title, text]) => ({ title, text }))
  const steps = homepage.steps?.length ? homepage.steps : fallbackSteps.map(([title, text]) => ({ title, text }))
  const faqs = homepage.faqs || []

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: company?.companyName || "Vendor Management",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: sub,
    areaServed: "United Arab Emirates",
  }

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="border-b border-border bg-background">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold text-primary">United Arab Emirates</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-medium leading-tight">{headline}</h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground">{sub}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/login" className="inline-flex h-8 items-center rounded-[3px] bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-[var(--primary-hover)]">Vendor sign in</Link>
              <Link href="/how-it-works" className="inline-flex h-8 items-center rounded-[3px] border border-border bg-card px-3 text-sm font-medium hover:bg-muted">See the workflow</Link>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-raised)]">
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground"><span>Workspace preview</span><span>Sample layout</span></div>
            <div className="grid grid-cols-2 gap-2">
              {["Vendors", "Documents", "RFQs", "Payments"].map((label) => (
                <div key={label} className="rounded-[3px] border border-border bg-background p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-2 h-1.5 w-16 rounded-[3px] bg-primary/30" />
                </div>
              ))}
            </div>
            <div className="mt-3 h-24 rounded-[3px] bg-accent" />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-3xl">What the desk covers</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-raised)]">
              <h3 className="font-medium">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-3xl">Vendor lifecycle</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-5">
            {steps.map((step, index) => (
              <li key={step.title} className="rounded-lg border border-border bg-background p-4">
                <div className="text-xs font-bold text-primary">0{index + 1}</div>
                <h3 className="mt-2 font-medium">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl">Compliance without hardcoded rules</h2>
          <p className="mt-4 text-muted-foreground">Reminder windows, required documents, VAT, and approval steps are settings. A trade licence can expire in Dubai on a different cadence than insurance for a free-zone contractor, and the desk follows the configuration you save.</p>
        </div>
        <div>
          <h2 className="font-display text-3xl">Events, then the commercial trail</h2>
          <p className="mt-4 text-muted-foreground">Assign several vendors to one event, send an RFQ, compare quotations, issue a purchase order, and keep the contract, tasks, deliveries, invoice, and score on the same company record.</p>
        </div>
      </section>
      {faqs.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 pb-16">
          <h2 className="font-display text-3xl">Questions</h2>
          <div className="mt-6 space-y-4">
            {faqs.map((faq) => <article key={faq.q}><h3 className="font-medium">{faq.q}</h3><p className="mt-1 text-sm text-muted-foreground">{faq.a}</p></article>)}
          </div>
        </section>
      )}
      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-14 md:flex-row md:items-center">
          <h2 className="font-display text-3xl">Open the vendor portal or the staff desk.</h2>
          <Link href="/login" className="inline-flex h-8 items-center rounded-[3px] bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-[var(--primary-hover)]">Vendor sign in</Link>
        </div>
      </section>
    </main>
  )
}
