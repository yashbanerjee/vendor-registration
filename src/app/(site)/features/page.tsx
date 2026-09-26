import type { Metadata } from "next"
export const metadata: Metadata = { title: "Features" }
const items = [
  ["Onboarding", "Multi-step public registration, drafts, and CSV or Excel import with a validation preview."],
  ["Configurable forms", "Add fields, mark them required, and show them only for selected categories."],
  ["Verification", "Approve, reject, or request changes, with a workflow per category."],
  ["Documents", "Issue dates, expiry, reviewer, and rejection reason on every file."],
  ["Events and RFQs", "Assign vendors, invite them to quote, and compare line items."],
  ["Orders and contracts", "Purchase orders with PDF output, plus NDAs and event contracts."],
  ["Site operations", "Tasks, deliveries, workforce approval, and QR gate passes."],
  ["Finance", "Invoices, advances, partial payments, and overdue status."],
  ["Insight", "Performance scores, support tickets, reports, and an audit log."],
]
export default function FeaturesPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-3xl font-medium">Features</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {items.map(([title, text]) => <article key={title} className="rounded-lg border border-border bg-card p-4"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{text}</p></article>)}
      </div>
    </main>
  )
}
