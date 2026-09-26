"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Select, Textarea } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RegisterWizard } from "@/components/crm/register-wizard"
import { api } from "@/lib/api-client"
import { formatDate, formatMoney, labelize } from "@/lib/format"

type Vendor = {
  id: string
  vendorCode: string
  legalName: string
  tradeName?: string | null
  status: string
  emirate?: string | null
  complianceScore: number
  address?: string | null
  website?: string | null
  trn?: string | null
  vatStatus?: string | null
  iban?: string | null
  bankName?: string | null
  businessActivity?: string | null
  zoneType?: string | null
  tradeLicenseNumber?: string | null
  licenseAuthority?: string | null
  isDemo?: boolean
  categories?: { category: { name: string } }[]
  contacts?: { name: string; email?: string | null; phone?: string | null; title?: string | null }[]
  services?: { service: { name: string } }[]
  documents?: { id: string; title: string; status: string; expiryDate?: string | null }[]
  notes?: { id: string; body: string; createdAt: string; author?: { name: string } | null }[]
  approvalRequests?: { status: string; workflow: { name: string; steps: { name: string }[] }; currentStep: number; actions: { action: string; note?: string | null; createdAt: string; actor?: { name: string } | null }[] }[]
  performances?: { quality: number; delivery: number; communication: number; compliance: number; createdAt: string; comments?: string | null }[]
  fieldReviews?: { id: string; fieldKey: string; label: string; note: string }[]
  _count?: Record<string, number>
}

const tabs = ["Overview", "Company", "Contacts", "Services", "Documents", "Compliance", "Events", "RFQs", "Quotations", "POs", "Contracts", "Tasks", "Deliveries", "Workforce", "Invoices", "Payments", "Performance", "Notes", "Activity"]

const fieldOptions = [
  { key: "legalName", label: "Legal company name" },
  { key: "tradeName", label: "Trade name" },
  { key: "tradeLicenseNumber", label: "Trade licence" },
  { key: "licenseAuthority", label: "Issuing authority" },
  { key: "trn", label: "TRN" },
  { key: "vatStatus", label: "VAT status" },
  { key: "bankName", label: "Bank" },
  { key: "iban", label: "IBAN" },
  { key: "address", label: "Address" },
]

export function VendorProfile({ id, currency, portal = "admin" }: { id: string; currency: string; portal?: "admin" | "vendor" }) {
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [related, setRelated] = useState<Record<string, { label: string }[]>>({})
  const [activity, setActivity] = useState<{ id: string; action: string; createdAt: string; user?: { name: string } | null }[]>([])
  const [error, setError] = useState("")
  const [note, setNote] = useState("")
  const [fieldKey, setFieldKey] = useState("tradeLicenseNumber")
  const [fieldNote, setFieldNote] = useState("")

  useEffect(() => {
    const vendorId = id
    api<Vendor>(portal === "vendor" ? `/api/vendors/${vendorId}` : `/api/vendors/${vendorId}`)
      .then(async (data) => {
        setVendor(data)
        const pairs = [
          ["events", `/api/events?vendorId=${data.id}&pageSize=10`],
          ["rfqs", `/api/rfqs?vendorId=${data.id}&pageSize=10`],
          ["quotations", `/api/quotations?vendorId=${data.id}&pageSize=10`],
          ["pos", `/api/purchase-orders?vendorId=${data.id}&pageSize=10`],
          ["contracts", `/api/contracts?vendorId=${data.id}&pageSize=10`],
          ["tasks", `/api/tasks?vendorId=${data.id}&pageSize=10`],
          ["deliveries", `/api/deliveries?vendorId=${data.id}&pageSize=10`],
          ["workforce", `/api/workforce?vendorId=${data.id}&pageSize=10`],
          ["invoices", `/api/invoices?vendorId=${data.id}&pageSize=10`],
          ["payments", `/api/payments?vendorId=${data.id}&pageSize=10`],
        ] as const
        const next: Record<string, { label: string }[]> = {}
        await Promise.all(pairs.map(async ([key, url]) => {
          try {
            const rows = await api<{ number?: string; name?: string; title?: string; reference?: string; subject?: string }[]>(url)
            next[key] = rows.map((row) => ({ label: row.name || row.title || row.number || row.reference || row.subject || "Record" }))
          } catch {
            next[key] = []
          }
        }))
        setRelated(next)
        if (portal === "admin") {
          api<typeof activity>(`/api/vendors/${data.id}/activity`).then(setActivity).catch(() => undefined)
        }
      })
      .catch((reason) => setError(reason.message))
  }, [id, portal])

  if (error) return <Card className="p-8">{error}</Card>
  if (!vendor) return <Skeleton className="h-64" />

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{vendor.legalName}</h1>
              {vendor.isDemo && <Badge value="DRAFT" className="bg-secondary" />}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{vendor.vendorCode} · {vendor.tradeName || "No trade name"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge value={vendor.status} />
            <Badge value={vendor.emirate || "UAE"} />
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">Compliance {vendor.complianceScore}%</span>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{vendor.categories?.map((item) => item.category.name).join(", ") || "No category yet"}</p>
      </Card>
      {portal === "vendor" && (vendor.fieldReviews || []).length > 0 && (
        <Card className="space-y-3 p-5">
          <h2 className="font-medium">The team asked you to update these fields</h2>
          {(vendor.fieldReviews || []).map((review) => (
            <div key={review.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="font-medium">{review.label}</div>
              <p className="mt-1 text-muted-foreground">{review.note}</p>
            </div>
          ))}
        </Card>
      )}
      {portal === "vendor" && (vendor.status === "DRAFT" || vendor.status === "CHANGES_REQUESTED") && <RegisterWizard mode="continue" />}
      {portal === "vendor" && vendor.status !== "DRAFT" && vendor.status !== "CHANGES_REQUESTED" && vendor.status !== "APPROVED" && vendor.status !== "ACTIVE" && (
        <Card className="p-5 text-sm text-muted-foreground">Your details are submitted. You can follow the status here. Workspace actions open after approval.</Card>
      )}
      <Tabs defaultValue="Overview">
        <TabsList className="flex h-auto flex-wrap">
          {tabs.map((tab) => <TabsTrigger key={tab} value={tab}>{tab}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="Overview">
          <div className="grid gap-3 md:grid-cols-4">
            {Object.entries(vendor._count || {}).map(([key, value]) => <Card key={key} className="p-4"><div className="text-sm text-muted-foreground">{labelize(key)}</div><div className="text-2xl font-semibold">{value}</div></Card>)}
          </div>
        </TabsContent>
        <TabsContent value="Company">
          <Info rows={[["Licence", vendor.tradeLicenseNumber], ["Authority", vendor.licenseAuthority], ["Zone", vendor.zoneType], ["Activity", vendor.businessActivity], ["Address", vendor.address], ["Website", vendor.website], ["TRN", vendor.trn], ["VAT", vendor.vatStatus], ["Bank", vendor.bankName], ["IBAN", vendor.iban]]} />
          {portal === "admin" && (
            <form className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto]" onSubmit={async (event) => {
              event.preventDefault()
              const label = fieldOptions.find((item) => item.key === fieldKey)?.label || fieldKey
              await api(`/api/vendors/${vendor.id}/field-reviews`, { method: "POST", body: JSON.stringify({ fieldKey, label, note: fieldNote }) })
              setFieldNote("")
              toast.success("The vendor will see this note on the dashboard and by email.")
              const next = await api<Vendor>(`/api/vendors/${vendor.id}`)
              setVendor(next)
            }}>
              <SelectField value={fieldKey} onChange={setFieldKey} />
              <Textarea value={fieldNote} onChange={(event) => setFieldNote(event.target.value)} placeholder="Tell the vendor what to correct" required />
              <Button type="submit">Request update</Button>
            </form>
          )}
        </TabsContent>
        <TabsContent value="Contacts"><List items={(vendor.contacts || []).map((contact) => `${contact.name} · ${contact.title || "Contact"} · ${contact.email || ""} ${contact.phone || ""}`)} /></TabsContent>
        <TabsContent value="Services"><List items={(vendor.services || []).map((item) => item.service.name)} /></TabsContent>
        <TabsContent value="Documents"><List items={(vendor.documents || []).map((doc) => `${doc.title} · ${labelize(doc.status)} · ${formatDate(doc.expiryDate)}`)} /></TabsContent>
        <TabsContent value="Compliance"><Card className="p-5 text-sm">Score {vendor.complianceScore}%. Required documents are approved only while they are inside their expiry date.</Card></TabsContent>
        <TabsContent value="Events"><List items={(related.events || []).map((item) => item.label)} /></TabsContent>
        <TabsContent value="RFQs"><List items={(related.rfqs || []).map((item) => item.label)} /></TabsContent>
        <TabsContent value="Quotations"><List items={(related.quotations || []).map((item) => item.label)} /></TabsContent>
        <TabsContent value="POs"><List items={(related.pos || []).map((item) => item.label)} /></TabsContent>
        <TabsContent value="Contracts"><List items={(related.contracts || []).map((item) => item.label)} /></TabsContent>
        <TabsContent value="Tasks"><List items={(related.tasks || []).map((item) => item.label)} /></TabsContent>
        <TabsContent value="Deliveries"><List items={(related.deliveries || []).map((item) => item.label)} /></TabsContent>
        <TabsContent value="Workforce"><List items={(related.workforce || []).map((item) => item.label)} /></TabsContent>
        <TabsContent value="Invoices"><List items={(related.invoices || []).map((item) => item.label)} /></TabsContent>
        <TabsContent value="Payments"><List items={(related.payments || []).map((item) => item.label)} /></TabsContent>
        <TabsContent value="Performance">
          <div className="space-y-3">{(vendor.performances || []).map((item, index) => <Card key={index} className="p-4 text-sm">Quality {item.quality} · Delivery {item.delivery} · Communication {item.communication} · Compliance {item.compliance}<p className="mt-2 text-muted-foreground">{item.comments}</p></Card>)}{(vendor.performances || []).length === 0 && <Empty />}</div>
        </TabsContent>
        <TabsContent value="Notes">
          {portal === "admin" && (
            <form className="mb-4 flex gap-2" onSubmit={async (event) => {
              event.preventDefault()
              await api(`/api/vendors/${vendor.id}/notes`, { method: "POST", body: JSON.stringify({ body: note }) })
              setNote("")
              toast.success("Note added.")
            }}>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Internal note" />
              <Button type="submit">Add</Button>
            </form>
          )}
          <List items={(vendor.notes || []).map((item) => `${item.author?.name || "Team"} · ${formatDate(item.createdAt, true)} · ${item.body}`)} />
        </TabsContent>
        <TabsContent value="Activity">
          <div className="space-y-3 border-l border-border pl-4">
            {activity.map((item) => <div key={item.id}><div className="text-sm font-medium">{item.user?.name || "System"} {item.action}</div><div className="text-xs text-muted-foreground">{formatDate(item.createdAt, true)}</div></div>)}
            {activity.length === 0 && <Empty />}
          </div>
          {(vendor.approvalRequests || []).map((request) => (
            <Card key={request.workflow.name} className="mt-4 p-4 text-sm">
              <div className="font-medium">{request.workflow.name} · step {request.currentStep + 1}</div>
              <p className="text-muted-foreground">{request.workflow.steps.map((step) => step.name).join(" → ")}</p>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground">Amounts on related commercial records use {currency}.</p>
    </div>
  )
}

function SelectField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      {fieldOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
    </Select>
  )
}

function Info({ rows }: { rows: (string | null | undefined)[][] }) {
  return <Card className="divide-y divide-border">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4 p-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="text-right">{value || "—"}</span></div>)}</Card>
}
function List({ items }: { items: string[] }) {
  if (!items.length) return <Empty />
  return <Card className="divide-y divide-border">{items.map((item) => <div key={item} className="p-3 text-sm">{item}</div>)}</Card>
}
function Empty() {
  return <Card className="p-8 text-sm text-muted-foreground">Nothing recorded in this section yet.</Card>
}

export function moneyHint(value: unknown, currency: string) {
  return formatMoney(value, currency)
}
