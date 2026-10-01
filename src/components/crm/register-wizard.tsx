"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label, Select, Textarea } from "@/components/ui/input"
import { api } from "@/lib/api-client"
import { COMPANY_TYPES, VAT_STATUSES, ZONE_TYPES } from "@/lib/constants"

const steps = ["Account", "Company", "Business", "Tax", "Services", "Documents", "Banking", "Review", "Submit"]

type FormState = Record<string, string>

export function RegisterWizard({ mode = "public" }: { mode?: "public" | "continue" }) {
  const router = useRouter()
  const [step, setStep] = useState(mode === "continue" ? 1 : 0)
  const [form, setForm] = useState<FormState>({})
  const [options, setOptions] = useState<{ categories: { id: string; name: string }[]; emirates: { name: string }[]; documentTypes: { id: string; name: string; required: boolean }[]; terms: { id: string; name: string }[]; fields: { key: string; label: string; section: string; required: boolean; fieldType: string }[] }>({ categories: [], emirates: [], documentTypes: [], terms: [], fields: [] })
  const [fileNote, setFileNote] = useState("")

  useEffect(() => {
    api<typeof options>("/api/auth/registration-form").then(setOptions).catch(() => undefined)
  }, [])

  function set(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function saveDraft(nextStep: number) {
    if (step === 0 && mode === "public") {
      await api("/api/auth/register", { method: "POST", body: JSON.stringify({ name: form.name, email: form.email, password: form.password, phone: form.phone }) })
      setStep(1)
      return
    }
    await api("/api/auth/register", {
      method: "PATCH",
      body: JSON.stringify({
        draftStep: nextStep + 1,
        legalName: form.legalName,
        tradeName: form.tradeName,
        tradeLicenseNumber: form.tradeLicenseNumber,
        licenseAuthority: form.licenseAuthority,
        licenseIssueDate: form.licenseIssueDate,
        licenseExpiryDate: form.licenseExpiryDate,
        companyType: form.companyType,
        businessActivity: form.businessActivity,
        zoneType: form.zoneType,
        emirate: form.emirate,
        address: form.address,
        website: form.website,
        trn: form.trn,
        vatStatus: form.vatStatus,
        corporateTaxInfo: form.corporateTaxInfo,
        bankName: form.bankName,
        iban: form.iban,
        accountName: form.accountName,
        paymentTermId: form.paymentTermId,
        categoryIds: form.categoryId ? [form.categoryId] : [],
        contact: form.contactName ? { name: form.contactName, email: form.email || "", phone: form.phone || "", title: form.contactTitle || "" } : undefined,
      }),
    })
    setStep(nextStep)
  }

  async function upload(file: File) {
    const session = await api<{ user: { vendorId: string } }>("/api/auth/session")
    const body = new FormData()
    body.set("file", file)
    const response = await fetch("/api/uploads", { method: "POST", body })
    const payload = await response.json()
    if (!payload.success) throw new Error(payload.message)
    await api("/api/vendor-documents", {
      method: "POST",
      body: JSON.stringify({
        vendorId: session.user.vendorId,
        title: file.name,
        documentTypeId: form.documentTypeId || null,
        fileAssetId: payload.data.id,
      }),
    })
  }

  return (
    <Card className="mx-auto max-w-3xl space-y-5 p-6">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">Vendor registration</p>
        <h1 className="mt-1 text-2xl font-semibold">Step {step + 1} of {steps.length}: {steps[step]}</h1>
      </div>
      <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
      {step === 0 && (
        <div className="grid gap-3">
          <Field label="Your name"><Input value={form.name || ""} onChange={(event) => set("name", event.target.value)} /></Field>
          <Field label="Work email"><Input type="email" value={form.email || ""} onChange={(event) => set("email", event.target.value)} /></Field>
          <Field label="Password"><Input type="password" value={form.password || ""} onChange={(event) => set("password", event.target.value)} /></Field>
          <Field label="Phone"><Input value={form.phone || ""} onChange={(event) => set("phone", event.target.value)} /></Field>
        </div>
      )}
      {step === 1 && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Legal company name"><Input value={form.legalName || ""} onChange={(event) => set("legalName", event.target.value)} /></Field>
          <Field label="Trade name"><Input value={form.tradeName || ""} onChange={(event) => set("tradeName", event.target.value)} /></Field>
          <Field label="Trade license number"><Input value={form.tradeLicenseNumber || ""} onChange={(event) => set("tradeLicenseNumber", event.target.value)} /></Field>
          <Field label="Issuing authority"><Input value={form.licenseAuthority || ""} onChange={(event) => set("licenseAuthority", event.target.value)} /></Field>
          <Field label="Issue date"><Input type="date" value={form.licenseIssueDate || ""} onChange={(event) => set("licenseIssueDate", event.target.value)} /></Field>
          <Field label="Expiry date"><Input type="date" value={form.licenseExpiryDate || ""} onChange={(event) => set("licenseExpiryDate", event.target.value)} /></Field>
          <Field label="Office address"><Textarea value={form.address || ""} onChange={(event) => set("address", event.target.value)} /></Field>
          <Field label="Website"><Input value={form.website || ""} onChange={(event) => set("website", event.target.value)} /></Field>
        </div>
      )}
      {step === 2 && (
        <div className="grid gap-3">
          <Field label="Company type"><Select value={form.companyType || ""} onChange={(event) => set("companyType", event.target.value)}><option value="">Select</option>{COMPANY_TYPES.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          <Field label="Business activity"><Input value={form.businessActivity || ""} onChange={(event) => set("businessActivity", event.target.value)} /></Field>
          <Field label="Mainland or free zone"><Select value={form.zoneType || ""} onChange={(event) => set("zoneType", event.target.value)}><option value="">Select</option>{ZONE_TYPES.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          <Field label="Emirate"><Select value={form.emirate || ""} onChange={(event) => set("emirate", event.target.value)}><option value="">Select</option>{options.emirates.map((item) => <option key={item.name}>{item.name}</option>)}</Select></Field>
        </div>
      )}
      {step === 3 && (
        <div className="grid gap-3">
          <Field label="TRN"><Input value={form.trn || ""} onChange={(event) => set("trn", event.target.value)} /></Field>
          <Field label="VAT status"><Select value={form.vatStatus || ""} onChange={(event) => set("vatStatus", event.target.value)}><option value="">Select</option>{VAT_STATUSES.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          <Field label="Corporate tax information"><Textarea value={form.corporateTaxInfo || ""} onChange={(event) => set("corporateTaxInfo", event.target.value)} /></Field>
        </div>
      )}
      {step === 4 && (
        <Field label="Category"><Select value={form.categoryId || ""} onChange={(event) => set("categoryId", event.target.value)}><option value="">Select</option>{options.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      )}
      {step === 5 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Documents are optional. Continue without a file if you do not have one yet.</p>
          <Field label="Document type"><Select value={form.documentTypeId || ""} onChange={(event) => set("documentTypeId", event.target.value)}><option value="">Select</option>{options.documentTypes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.required ? " (required)" : ""}</option>)}</Select></Field>
          <Input type="file" onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            upload(file).then(() => { setFileNote(`${file.name} uploaded.`); toast.success("Document uploaded.") }).catch((error) => toast.error(error.message))
          }} />
          {fileNote && <p className="text-sm text-muted-foreground">{fileNote}</p>}
        </div>
      )}
      {step === 6 && (
        <div className="grid gap-3">
          <Field label="Bank"><Input value={form.bankName || ""} onChange={(event) => set("bankName", event.target.value)} /></Field>
          <Field label="IBAN"><Input value={form.iban || ""} onChange={(event) => set("iban", event.target.value)} /></Field>
          <Field label="Account name"><Input value={form.accountName || ""} onChange={(event) => set("accountName", event.target.value)} /></Field>
          <Field label="Payment terms"><Select value={form.paymentTermId || ""} onChange={(event) => set("paymentTermId", event.target.value)}><option value="">Select</option>{options.terms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        </div>
      )}
      {step >= 7 && (
        <div className="space-y-2 text-sm">
          <p><strong>{form.legalName || form.name}</strong></p>
          <p className="text-muted-foreground">{form.emirate} · {form.zoneType} · {form.vatStatus}</p>
          <p>Review the details, then submit. You can return later while the application is still a draft.</p>
        </div>
      )}
      <div className="flex justify-between">
        <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>Back</Button>
        {step < 8 ? (
          <Button onClick={() => saveDraft(Math.min(step + 1, 8)).catch((error) => toast.error(error.message))}>{step === 0 ? "Create account" : "Save and continue"}</Button>
        ) : (
          <Button onClick={async () => {
            await saveDraft(8)
            await api("/api/auth/register/submit", { method: "POST" })
            toast.success("Application submitted.")
            router.push("/vendor")
          }}>Submit application</Button>
        )}
      </div>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label><div className="mt-1">{children}</div></div>
}
