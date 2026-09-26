"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api-client"
import { formatMoney, labelize } from "@/lib/format"
import type { FeatureFlag } from "@/lib/types"

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
}

const adminCards = [
  ["totalVendors", "Vendors", "vendorRegistration"],
  ["pendingVendors", "Pending", "vendorVerification"],
  ["approvedVendors", "Approved", "vendorApproval"],
  ["activeVendors", "Active", "vendorRegistration"],
  ["suspendedVendors", "Suspended", "vendorRegistration"],
  ["expiringDocs", "Expiring documents", "documents"],
  ["pendingApprovals", "Pending approvals", "vendorApproval"],
  ["activeEvents", "Active events", "events"],
  ["activeRfqs", "Active RFQs", "rfq"],
  ["pendingQuotations", "Pending quotations", "quotation"],
  ["activePos", "Active POs", "purchaseOrder"],
  ["pendingInvoices", "Pending invoices", "invoices"],
  ["outstandingPayments", "Outstanding", "payments"],
] as const

export function Dashboard({ portal, features, currency }: { portal: "admin" | "vendor"; features: FeatureFlag[]; currency: string }) {
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
            <Card className="space-y-3 p-5">
              <h2 className="font-medium">Updates requested</h2>
              {reviews.map((review) => (
                <div key={review.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="font-medium">{review.label}</div>
                  <p className="mt-1 text-muted-foreground">{review.note}</p>
                </div>
              ))}
            </Card>
          )}
        </div>
      )
    }
    const cards = [
      ["Compliance", `${data.vendor?.complianceScore ?? 0}%`],
      ["Pending documents", String(data.stats.expiringDocs || 0)],
      ["Active events", String(data.stats.activeEvents || 0)],
      ["RFQs", String(data.stats.activeRfqs || 0)],
      ["Pending quotations", String(data.stats.pendingQuotations || 0)],
      ["Open tasks", String(data.stats.openTasks || 0)],
      ["Pending invoices", String(data.stats.pendingInvoices || 0)],
    ]
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

  const cards = adminCards.filter((card) => !card[2] || enabled.has(card[2]))
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">Today</p>
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
        <ChartCard title="Vendor registrations">
          <AreaChart data={data.registrations}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Area dataKey="count" stroke="var(--primary)" fill="var(--accent)" /></AreaChart>
        </ChartCard>
        <ChartCard title="Approvals">
          <BarChart data={data.approvals}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="var(--primary)" radius={4} /></BarChart>
        </ChartCard>
        {enabled.has("vendorRegistration") && <ChartCard title="Vendors by category"><BarChart data={data.categories.slice(0, 8)}><XAxis dataKey="name" hide /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="var(--primary)" radius={3} /></BarChart></ChartCard>}
        {enabled.has("events") && <ChartCard title="Vendors by event"><BarChart data={data.events}><XAxis dataKey="name" hide /><Tooltip /><Bar dataKey="count" fill="var(--primary)" radius={4} /></BarChart></ChartCard>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5"><h2 className="font-medium">Spending</h2><ul className="mt-3 space-y-2 text-sm">{data.spending.map((item) => <li key={item.name} className="flex justify-between"><span>{item.name}</span><span>{formatMoney(item.total, currency)}</span></li>)}</ul></Card>
        <Card className="p-5"><h2 className="font-medium">Invoice status</h2><ul className="mt-3 space-y-2 text-sm">{data.invoices.map((item) => <li key={item.status} className="flex justify-between"><span>{labelize(item.status)}</span><span>{item.count}</span></li>)}</ul></Card>
        <Card className="p-5"><h2 className="font-medium">Vendor status</h2><ul className="mt-3 space-y-2 text-sm">{data.compliance.map((item) => <li key={item.label} className="flex justify-between"><span>{labelize(item.label)}</span><span>{item.count}</span></li>)}</ul></Card>
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
