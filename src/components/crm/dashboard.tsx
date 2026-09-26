"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { RecordTable } from "@/components/crm/data-table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api-client"
import { formatDate, formatMoney, labelize } from "@/lib/format"
import { can } from "@/lib/permissions"
import type { FeatureFlag, PublicUser } from "@/lib/types"

type DashboardData = {
  vendor?: { legalName: string; complianceScore: number; status: string; fieldReviews?: { id: string; label: string; note: string }[] } | null
  stats: Record<string, number>
  registrations: { month: string; count: number }[]
  approvals: { month: string; count: number }[]
  categories: { name: string; count: number }[]
  events: { name: string; count: number }[]
  spending: { name: string; total: number }[]
  invoices: { status: string; count: number }[]
  compliance: { label: string; count: number }[]
  documents: { id: string; title: string; status: string; expiryDate?: string | null }[]
  rfqs: { id: string; number: string; title: string; status: string; deadline?: string | null }[]
  invoiceRows: { id: string; number: string; total: string | number; status: string; vendor?: { legalName: string } | null }[]
  paymentRows: { id: string; reference: string; amount: string | number; status: string; vendor?: { legalName: string } | null }[]
}

const adminCards = [
  ["totalVendors", "Vendors", "vendorRegistration", "vendors"],
  ["pendingVendors", "Pending", "vendorVerification", "vendors"],
  ["approvedVendors", "Approved", "vendorApproval", "vendors"],
  ["activeVendors", "Active", "vendorRegistration", "vendors"],
  ["suspendedVendors", "Suspended", "vendorRegistration", "vendors"],
  ["expiringDocs", "Expiring documents", "documents", "documents"],
  ["pendingApprovals", "Pending approvals", "vendorApproval", "approvals"],
  ["activeEvents", "Active events", "events", "events"],
  ["activeRfqs", "Active RFQs", "rfq", "rfqs"],
  ["pendingQuotations", "Pending quotations", "quotation", "quotations"],
  ["activePos", "Active POs", "purchaseOrder", "purchaseOrders"],
  ["pendingInvoices", "Pending invoices", "invoices", "invoices"],
  ["outstandingPayments", "Outstanding", "payments", "payments"],
] as const

export function Dashboard({ portal, features, currency, user }: { portal: "admin" | "vendor"; features: FeatureFlag[]; currency: string; user: PublicUser }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState("")
  const enabled = new Set(features.filter((feature) => feature.enabled).map((feature) => feature.key))

  useEffect(() => {
    api<DashboardData>("/api/dashboard").then(setData).catch((reason) => setError(reason.message))
  }, [])

  if (error) return <Card className="p-8"><h1 className="text-xl font-semibold">Dashboard unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p></Card>
  if (!data) return <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-24" />)}</div>

  if (portal === "vendor") {
    const status = data.vendor?.status || "DRAFT"
    const approved = status === "APPROVED" || status === "ACTIVE"
    const reviews = data.vendor?.fieldReviews || []
    if (!approved) {
      return (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Welcome</p>
            <h1 className="text-xl font-medium">{data.vendor?.legalName || "Your company"}</h1>
          </div>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Application status</p>
            <p className="mt-1 text-2xl font-semibold">{labelize(status)}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              {status === "DRAFT" || status === "CHANGES_REQUESTED"
                ? "Update the requested details and submit them for verification. Other workspace actions stay closed until the company is approved."
                : "Your file is with the team. You can follow this status. Other actions open after approval."}
            </p>
            {(status === "DRAFT" || status === "CHANGES_REQUESTED") && <Link href="/vendor/profile" className="mt-4 inline-flex h-8 items-center rounded-[3px] bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-[var(--primary-hover)]">Open company details</Link>}
          </Card>
          {reviews.length > 0 && (
            <div>
              <h2 className="mb-2 font-medium">Updates requested</h2>
              <RecordTable rows={reviews} empty="No updates requested." rowKey={(row) => row.id} columns={[{ header: "Field", className: "font-medium", cell: (row) => row.label }, { header: "Note", cell: (row) => row.note }]} />
            </div>
          )}
        </div>
      )
    }
    const cards = [
      can(user, "vendors", "VIEW") ? ["Compliance", `${data.vendor?.complianceScore ?? 0}%`] : null,
      can(user, "documents", "VIEW") ? ["Pending documents", String(data.stats.expiringDocs || 0)] : null,
      can(user, "events", "VIEW") ? ["Active events", String(data.stats.activeEvents || 0)] : null,
      can(user, "rfqs", "VIEW") ? ["RFQs", String(data.stats.activeRfqs || 0)] : null,
      can(user, "quotations", "VIEW") ? ["Pending quotations", String(data.stats.pendingQuotations || 0)] : null,
      can(user, "tasks", "VIEW") ? ["Open tasks", String(data.stats.openTasks || 0)] : null,
      can(user, "invoices", "VIEW") ? ["Pending invoices", String(data.stats.pendingInvoices || 0)] : null,
      can(user, "payments", "VIEW") ? ["Outstanding", formatMoney(data.stats.outstandingPayments || 0, currency)] : null,
    ].filter((card): card is [string, string] => Boolean(card))
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Welcome</p>
          <h1 className="text-xl font-medium">{data.vendor?.legalName || "Your company"}</h1>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value]) => (
            <Card key={label}><CardHeader><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{value}</CardContent></Card>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {can(user, "documents", "VIEW") && (
            <div>
              <h2 className="mb-2 font-medium">Documents</h2>
              <RecordTable rows={data.documents || []} empty="No documents yet." rowKey={(row) => row.id} columns={[{ header: "Document", className: "font-medium", cell: (row) => row.title }, { header: "Status", cell: (row) => <Badge value={row.status} /> }, { header: "Expiry", cell: (row) => formatDate(row.expiryDate) }]} />
            </div>
          )}
          {can(user, "rfqs", "VIEW") && (
            <div>
              <h2 className="mb-2 font-medium">RFQs</h2>
              <RecordTable rows={data.rfqs || []} empty="No RFQs yet." rowKey={(row) => row.id} columns={[{ header: "RFQ", className: "font-medium", cell: (row) => row.number }, { header: "Requirement", cell: (row) => row.title }, { header: "Deadline", cell: (row) => formatDate(row.deadline) }, { header: "Status", cell: (row) => <Badge value={row.status} /> }]} />
            </div>
          )}
          {can(user, "invoices", "VIEW") && (
            <div>
              <h2 className="mb-2 font-medium">Invoices</h2>
              <RecordTable rows={data.invoiceRows || []} empty="No invoices yet." rowKey={(row) => row.id} columns={[{ header: "Invoice", className: "font-medium", cell: (row) => row.number }, { header: "Amount", cell: (row) => formatMoney(row.total, currency) }, { header: "Status", cell: (row) => <Badge value={row.status} /> }]} />
            </div>
          )}
          {can(user, "payments", "VIEW") && (
            <div>
              <h2 className="mb-2 font-medium">Payments</h2>
              <RecordTable rows={data.paymentRows || []} empty="No payments yet." rowKey={(row) => row.id} columns={[{ header: "Payment", className: "font-medium", cell: (row) => row.reference }, { header: "Amount", cell: (row) => formatMoney(row.amount, currency) }, { header: "Status", cell: (row) => <Badge value={row.status} /> }]} />
            </div>
          )}
        </div>
        <Card className="p-4">
          <h2 className="mb-4 font-medium">Recent activity trend</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.registrations}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Area dataKey="count" stroke="var(--primary)" fill="var(--accent)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    )
  }

  const cards = adminCards.filter((card) => enabled.has(card[2]) && can(user, card[3], "VIEW"))
  const showVendors = can(user, "vendors", "VIEW")
  const showInvoices = can(user, "invoices", "VIEW")
  const showSpend = can(user, "purchaseOrders", "VIEW") || can(user, "payments", "VIEW")
  const showRfqs = can(user, "rfqs", "VIEW")
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">{user.isOrgAdmin ? "Organization admin" : user.teamAdminIds.length ? "Team admin" : user.role?.name || "Team user"}</p>
        <h1 className="text-xl font-medium">Operations overview</h1>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([key, label]) => (
          <Card key={key}>
            <CardHeader><CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{key === "outstandingPayments" ? formatMoney(data.stats[key] || 0, currency) : data.stats[key] || 0}</CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {showVendors && (
          <ChartCard title="Vendor registrations">
            <AreaChart data={data.registrations}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Area dataKey="count" stroke="var(--primary)" fill="var(--accent)" /></AreaChart>
          </ChartCard>
        )}
        {can(user, "approvals", "VIEW") && (
          <ChartCard title="Approvals">
            <BarChart data={data.approvals}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="var(--primary)" radius={4} /></BarChart>
          </ChartCard>
        )}
        {showVendors && enabled.has("vendorRegistration") && <ChartCard title="Vendors by category"><BarChart data={data.categories.slice(0, 8)}><XAxis dataKey="name" hide /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="var(--primary)" radius={3} /></BarChart></ChartCard>}
        {can(user, "events", "VIEW") && enabled.has("events") && <ChartCard title="Vendors by event"><BarChart data={data.events}><XAxis dataKey="name" hide /><Tooltip /><Bar dataKey="count" fill="var(--primary)" radius={4} /></BarChart></ChartCard>}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {showRfqs && (
          <div>
            <h2 className="mb-2 font-medium">RFQs</h2>
            <RecordTable rows={data.rfqs || []} empty="No RFQs yet." rowKey={(row) => row.id} columns={[{ header: "RFQ", className: "font-medium", cell: (row) => row.number }, { header: "Requirement", cell: (row) => row.title }, { header: "Deadline", cell: (row) => formatDate(row.deadline) }, { header: "Status", cell: (row) => <Badge value={row.status} /> }]} />
          </div>
        )}
        {showInvoices && (
          <div>
            <h2 className="mb-2 font-medium">Invoices</h2>
            <RecordTable rows={data.invoiceRows || []} empty="No invoices yet." rowKey={(row) => row.id} columns={[{ header: "Invoice", className: "font-medium", cell: (row) => row.number }, { header: "Vendor", cell: (row) => row.vendor?.legalName || "—" }, { header: "Amount", cell: (row) => formatMoney(row.total, currency) }, { header: "Status", cell: (row) => <Badge value={row.status} /> }]} />
          </div>
        )}
        {showSpend && (
          <div>
            <h2 className="mb-2 font-medium">Payments</h2>
            <RecordTable rows={data.paymentRows || []} empty="No payments yet." rowKey={(row) => row.id} columns={[{ header: "Payment", className: "font-medium", cell: (row) => row.reference }, { header: "Vendor", cell: (row) => row.vendor?.legalName || "—" }, { header: "Amount", cell: (row) => formatMoney(row.amount, currency) }, { header: "Status", cell: (row) => <Badge value={row.status} /> }]} />
          </div>
        )}
        {showVendors && (
          <div>
            <h2 className="mb-2 font-medium">Vendor status</h2>
            <RecordTable rows={data.compliance} empty="No vendors yet." rowKey={(row) => row.label} columns={[{ header: "Status", cell: (row) => labelize(row.label) }, { header: "Count", cell: (row) => row.count }]} />
          </div>
        )}
        {showSpend && (
          <div>
            <h2 className="mb-2 font-medium">Spending</h2>
            <RecordTable rows={data.spending} empty="No spending yet." rowKey={(row) => row.name} columns={[{ header: "Vendor", cell: (row) => row.name }, { header: "Amount", cell: (row) => formatMoney(row.total, currency) }]} />
          </div>
        )}
        {showInvoices && (
          <div>
            <h2 className="mb-2 font-medium">Invoice status</h2>
            <RecordTable rows={data.invoices} empty="No invoices yet." rowKey={(row) => row.status} columns={[{ header: "Status", cell: (row) => labelize(row.status) }, { header: "Count", cell: (row) => row.count }]} />
          </div>
        )}
      </div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 font-medium">{title}</h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </Card>
  )
}
