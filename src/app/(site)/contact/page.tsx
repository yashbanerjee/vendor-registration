import type { Metadata } from "next"
import { ContactForm } from "@/components/marketing/contact-form"
import { safeCompany } from "@/components/marketing/site-chrome"
export const metadata: Metadata = { title: "Contact" }
export default async function ContactPage() {
  const company = await safeCompany()
  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-2">
      <div>
        <h1 className="text-3xl font-medium">Contact</h1>
        <p className="mt-4 text-muted-foreground">Messages are stored for the team operating this installation. They are not sent to a third-party inbox unless an integration is configured.</p>
        <p className="mt-6 text-sm">{company?.email}<br />{company?.phone}<br />{company?.address}</p>
      </div>
      <ContactForm />
    </main>
  )
}
