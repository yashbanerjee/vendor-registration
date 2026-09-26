import type { Metadata } from "next"
export const metadata: Metadata = { title: "How it works" }
const steps = ["An administrator invites a vendor by email.", "The vendor sets a password and submits the required company details.", "Staff review company, tax, banking, and documents, and can send a field note back.", "The approval path you configured records each decision.", "Approved vendors are assigned to events.", "RFQs become quotations, purchase orders, and contracts.", "Tasks, passes, and deliveries run through the event.", "Invoices and payments are reconciled.", "The vendor is scored before the next engagement."]
export default function HowPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-display text-4xl">How it works</h1>
      <ol className="mt-8 space-y-4">
        {steps.map((step, index) => <li key={step} className="rounded-xl border border-border bg-card p-4"><span className="text-xs text-brass">0{index + 1}</span><p className="mt-1">{step}</p></li>)}
      </ol>
    </main>
  )
}
