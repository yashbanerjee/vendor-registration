"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { RecordTable } from "@/components/crm/data-table"
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
  const [related, setRelated] = useState<Record<string, Record<string, unknown>[]>>({})
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
        const next: Record<string, Record<string, unknown>[]> = {}
        await Promise.all(pairs.map(async ([key, url]) => {
          try {
            next[key] = await api<Record<string, unknown>[]>(url)
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
        <div>
          <h2 className="mb-2 font-medium">The team asked you to update these fields</h2>
          <RecordTable rows={vendor.fieldReviews || []} empty="No field notes." rowKey={(row) => row.id} columns={[{ header: "Field", className: "font-medium", cell: (row) => row.label }, { header: "Note", cell: (row) => row.note }]} />
        </div>
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
          <RecordTable
            rows={[
              ["Licence", vendor.tradeLicenseNumber],
              ["Authority", vendor.licenseAuthority],
              ["Zone", vendor.zoneType],
              ["Activity", vendor.businessActivity],
              ["Address", vendor.address],
              ["Website", vendor.website],
              ["TRN", vendor.trn],
              ["VAT", vendor.vatStatus],
              ["Bank", vendor.bankName],
              ["IBAN", vendor.iban],
            ]}
            empty="No company details yet."
            rowKey={(row) => String(row[0])}
            columns={[
              { header: "Field", cell: (row) => row[0] },
              { header: "Value", cell: (row) => row[1] || "—" },
            ]}
          />
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
        <TabsContent value="Contacts">
          <RecordTable rows={vendor.contacts || []} empty="No contacts yet." rowKey={(row, index) => `${row.email || row.name}-${index}`} columns={[{ header: "Name", className: "font-medium", cell: (row) => row.name }, { header: "Title", cell: (row) => row.title || "—" }, { header: "Email", cell: (row) => row.email || "—" }, { header: "Mobile", cell: (row) => row.phone || "—" }]} />
        </TabsContent>
        <TabsContent value="Services">
          <RecordTable rows={vendor.services || []} empty="No services yet." rowKey={(row, index) => `${row.service.name}-${index}`} columns={[{ header: "Service", cell: (row) => row.service.name }]} />
        </TabsContent>
        <TabsContent value="Documents">
          <p className="mb-3 text-sm text-muted-foreground">Files are optional. Company details are enough to submit and approve a vendor.</p>
          <RecordTable rows={vendor.documents || []} empty="No documents yet. This does not block registration." rowKey={(row) => row.id} columns={[{ header: "Document", className: "font-medium", cell: (row) => row.title }, { header: "Status", cell: (row) => <Badge value={row.status} /> }, { header: "Expiry", cell: (row) => formatDate(row.expiryDate) }]} />
        </TabsContent>
        <TabsContent value="Compliance"><Card className="p-5 text-sm">Score {vendor.complianceScore}%. Documents are optional. A score of 100% means no document type is required.</Card></TabsContent>
        <TabsContent value="Events"><RelatedTable rows={related.events} columns={[["code", "Code"], ["name", "Event"], ["client", "Client"], ["status", "Status"], ["startDate", "Starts"]]} /></TabsContent>
        <TabsContent value="RFQs"><RelatedTable rows={related.rfqs} columns={[["number", "RFQ"], ["title", "Requirement"], ["status", "Status"], ["deadline", "Deadline"]]} /></TabsContent>
        <TabsContent value="Quotations"><RelatedTable rows={related.quotations} money={currency} columns={[["number", "Quote"], ["total", "Total"], ["status", "Status"]]} /></TabsContent>
        <TabsContent value="POs"><RelatedTable rows={related.pos} money={currency} columns={[["number", "PO"], ["total", "Total"], ["status", "Status"]]} /></TabsContent>
        <TabsContent value="Contracts"><RelatedTable rows={related.contracts} columns={[["number", "Contract"], ["title", "Title"], ["status", "Status"]]} /></TabsContent>
        <TabsContent value="Tasks"><RelatedTable rows={related.tasks} columns={[["title", "Task"], ["priority", "Priority"], ["status", "Status"]]} /></TabsContent>
        <TabsContent value="Deliveries"><RelatedTable rows={related.deliveries} columns={[["number", "Delivery"], ["material", "Material"], ["status", "Status"]]} /></TabsContent>
        <TabsContent value="Workforce"><RelatedTable rows={related.workforce} columns={[["name", "Name"], ["role", "Role"], ["status", "Status"]]} /></TabsContent>
        <TabsContent value="Invoices"><RelatedTable rows={related.invoices} money={currency} columns={[["number", "Invoice"], ["total", "Total"], ["status", "Status"]]} /></TabsContent>
        <TabsContent value="Payments"><RelatedTable rows={related.payments} money={currency} columns={[["reference", "Payment"], ["amount", "Amount"], ["status", "Status"]]} /></TabsContent>
        <TabsContent value="Performance">
          <RecordTable
            rows={vendor.performances || []}
            empty="Nothing recorded in this section yet."
            rowKey={(row, index) => `${row.createdAt}-${index}`}
            columns={[
              { header: "Quality", cell: (row) => row.quality },
              { header: "Delivery", cell: (row) => row.delivery },
              { header: "Communication", cell: (row) => row.communication },
              { header: "Compliance", cell: (row) => row.compliance },
              { header: "Comments", cell: (row) => row.comments || "—" },
              { header: "Date", cell: (row) => formatDate(row.createdAt, true) },
            ]}
          />
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
          <RecordTable rows={vendor.notes || []} empty="Nothing recorded in this section yet." rowKey={(row) => row.id} columns={[{ header: "Author", cell: (row) => row.author?.name || "Team" }, { header: "Note", cell: (row) => row.body }, { header: "Date", cell: (row) => formatDate(row.createdAt, true) }]} />
        </TabsContent>
        <TabsContent value="Activity">
          <RecordTable rows={activity} empty="Nothing recorded in this section yet." rowKey={(row) => row.id} columns={[{ header: "User", cell: (row) => row.user?.name || "System" }, { header: "Action", cell: (row) => row.action }, { header: "Date", cell: (row) => formatDate(row.createdAt, true) }]} />
          {(vendor.approvalRequests || []).length > 0 && (
            <div className="mt-4">
              <RecordTable
                rows={vendor.approvalRequests || []}
                empty="No approval requests."
                rowKey={(row) => row.workflow.name}
                columns={[
                  { header: "Workflow", className: "font-medium", cell: (row) => row.workflow.name },
                  { header: "Status", cell: (row) => <Badge value={row.status} /> },
                  { header: "Current level", cell: (row) => `${row.currentStep + 1} / ${row.workflow.steps.length || 1}` },
                  { header: "Steps", cell: (row) => row.workflow.steps.map((step) => step.name).join(" → ") },
                ]}
              />
            </div>
          )}
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

function RelatedTable({ rows, columns, money }: { rows?: Record<string, unknown>[]; columns: [string, string][]; money?: string }) {
  return (
    <RecordTable
      rows={rows || []}
      empty="Nothing recorded in this section yet."
      rowKey={(row, index) => String(row.id || index)}
      columns={columns.map(([key, header]) => ({
        header,
        cell: (row: Record<string, unknown>) => {
          const value = row[key]
          if (value == null || value === "") return "—"
          if (key === "status") return <Badge value={String(value)} />
          if (money && (key === "total" || key === "amount")) return formatMoney(value, money)
          if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return formatDate(value)
          return String(value)
        },
      }))}
    />
  )
}

export function moneyHint(value: unknown, currency: string) {
  return formatMoney(value, currency)
}
