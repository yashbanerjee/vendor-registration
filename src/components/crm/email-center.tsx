"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label, Select, Textarea } from "@/components/ui/input"
import { api } from "@/lib/api-client"

type Campaign = { id: string; name: string; subject: string; status: string; category: string; createdAt: string; _count?: { messages: number } }
type Template = { id: string; key: string; name: string; category: string; subject: string; text: string; html: string; active: boolean }
type Message = { id: string; recipientEmail: string; recipientName?: string | null; subject: string; status: string; sentAt?: string | null; deliveredAt?: string | null; openedAt?: string | null; openCount: number; clickCount: number }

export function EmailCampaignList() {
  const [rows, setRows] = useState<Campaign[]>([])
  const [name, setName] = useState("")
  const [subject, setSubject] = useState("")
  const [bodyText, setBodyText] = useState("Hello {{vendorName}},\n\n{{companyName}} has an update for you.\n\nPortal: {{portalUrl}}")
  const [status, setStatus] = useState("")
  const [preview, setPreview] = useState("")

  function load() {
    api<Campaign[]>("/api/email/campaigns").then(setRows).catch((error) => toast.error(error.message))
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">Communication</p>
        <h1 className="text-xl font-medium">Email campaigns</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Campaigns are queued and sent by a worker. Sent means the provider accepted the message. Delivered is recorded only from a verified provider webhook.</p>
      </div>
      <Card className="grid gap-3 p-4 md:grid-cols-2">
        <div><Label>Campaign name</Label><Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div><Label>Subject</Label><Input className="mt-1" value={subject} onChange={(event) => setSubject(event.target.value)} /></div>
        <div>
          <Label>Vendor status filter</Label>
          <Select className="mt-1" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All vendors</option>
            {["DRAFT", "SUBMITTED", "APPROVED", "ACTIVE", "SUSPENDED"].map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </div>
        <div className="md:col-span-2"><Label>Message</Label><Textarea className="mt-1" value={bodyText} onChange={(event) => setBodyText(event.target.value)} /></div>
        <div className="flex gap-2 md:col-span-2">
          <Button variant="outline" onClick={async () => {
            const data = await api<{ count: number }>("/api/email/campaigns", { method: "POST", body: JSON.stringify({ name: name || "Preview", subject: subject || "Preview", bodyText, filters: status ? { status } : {}, previewOnly: true }) })
            setPreview(`${data.count} recipients match this filter.`)
          }}>Preview recipients</Button>
          <Button onClick={async () => {
            try {
              const data = await api<{ id: string; recipients: number }>("/api/email/campaigns", { method: "POST", body: JSON.stringify({ name, subject, bodyText, filters: status ? { status } : {}, category: "marketing" }) })
              toast.success(`Queued ${data.recipients} messages.`)
              load()
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not queue the campaign.")
            }
          }}>Queue campaign</Button>
        </div>
        {preview && <p className="text-sm text-muted-foreground md:col-span-2">{preview}</p>}
      </Card>
      <Card className="divide-y divide-border">
        {rows.map((row) => (
          <Link key={row.id} href={`/admin/email/${row.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted">
            <div>
              <div className="font-medium">{row.name}</div>
              <div className="text-sm text-muted-foreground">{row.subject}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{row._count?.messages || 0}</span>
              <Badge value={row.status} />
            </div>
          </Link>
        ))}
        {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">No campaigns yet.</p>}
      </Card>
    </div>
  )
}

export function EmailCampaignDetail({ id }: { id: string }) {
  const [data, setData] = useState<{ counts: Record<string, number>; total: number; rates: Record<string, number>; note: string; campaign: { name: string; status: string; subject: string } } | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [q, setQ] = useState("")

  async function load() {
    const [summary, list] = await Promise.all([
      api<NonNullable<typeof data>>(`/api/email/campaigns/${id}`),
      api<Message[]>(`/api/email/messages?campaignId=${id}&q=${encodeURIComponent(q)}`),
    ])
    setData(summary)
    setMessages(list)
  }
  useEffect(() => { load().catch((error) => toast.error(error.message)) }, [id])
  useEffect(() => {
    const stream = new EventSource(`/api/email/stream?campaignId=${id}`)
    stream.addEventListener("campaign:progress", (event) => {
      const counts = JSON.parse((event as MessageEvent).data) as Record<string, number>
      setData((current) => current ? { ...current, counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) } : current)
    })
    return () => stream.close()
  }, [id])

  const counts = data?.counts || {}
  const cards = ["QUEUED", "PROCESSING", "SENT", "DELIVERED", "OPENED", "CLICKED", "BOUNCED", "HARD_BOUNCED", "FAILED", "COMPLAINED", "UNSUBSCRIBED"]
  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/email" className="text-xs font-semibold text-muted-foreground hover:underline">Email campaigns</Link>
        <h1 className="text-xl font-medium">{data?.campaign.name || "Campaign"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data?.campaign.subject}</p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{data?.note}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Recipients</div><div className="text-2xl font-medium">{data?.total || 0}</div></Card>
        {cards.map((key) => <Card key={key} className="p-4"><div className="text-xs text-muted-foreground">{key.toLowerCase().replaceAll("_", " ")}</div><div className="text-2xl font-medium">{counts[key] || 0}</div></Card>)}
      </div>
      {data && (
        <Card className="grid gap-2 p-4 text-sm md:grid-cols-5">
          <div>Delivery rate {data.rates.delivery}%</div>
          <div>Open tracking {data.rates.open}%</div>
          <div>Click tracking {data.rates.click}%</div>
          <div>Bounce rate {data.rates.bounce}%</div>
          <div>Complaint rate {data.rates.complaint}%</div>
        </Card>
      )}
      <div className="flex gap-2">
        <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search recipient email" className="max-w-sm" />
        <Button variant="outline" onClick={() => load().catch((error) => toast.error(error.message))}>Search</Button>
      </div>
      <Card className="divide-y divide-border">
        {messages.map((message) => (
          <Link key={message.id} href={`/admin/email/messages/${message.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted">
            <div>
              <div className="font-medium">{message.recipientEmail}</div>
              <div className="text-sm text-muted-foreground">Tracking detected opens {message.openCount}. Clicks {message.clickCount}.</div>
            </div>
            <Badge value={message.status} />
          </Link>
        ))}
      </Card>
    </div>
  )
}

export function EmailMessageDetail({ id }: { id: string }) {
  const [message, setMessage] = useState<{ recipientEmail: string; subject: string; status: string; provider?: string | null; providerMessageId?: string | null; bounceType?: string | null; bounceReason?: string | null; note: string; campaign?: { name: string } | null; events: { id: string; eventType: string; timestamp: string }[] } | null>(null)
  useEffect(() => { api<NonNullable<typeof message>>(`/api/email/messages/${id}`).then(setMessage).catch((error) => toast.error(error.message)) }, [id])
  if (!message) return null
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium">{message.recipientEmail}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{message.subject}</p>
        <div className="mt-2"><Badge value={message.status} /></div>
        <p className="mt-2 text-sm text-muted-foreground">{message.note}</p>
      </div>
      <Card className="space-y-1 p-4 text-sm">
        <div>Campaign: {message.campaign?.name || "Transactional"}</div>
        <div>Provider: {message.provider || "—"}</div>
        <div>Provider message id: {message.providerMessageId || "—"}</div>
        {message.bounceReason && <div>Bounce: {message.bounceType} — {message.bounceReason}</div>}
      </Card>
      <Card className="space-y-2 p-4">
        <h2 className="font-medium">Timeline</h2>
        {message.events.map((event) => (
          <div key={event.id} className="text-sm">{event.eventType} · {new Date(event.timestamp).toLocaleString()}</div>
        ))}
      </Card>
    </div>
  )
}

export function EmailTemplates() {
  const [rows, setRows] = useState<Template[]>([])
  const [form, setForm] = useState({ key: "general_announcement", name: "General announcement", category: "marketing", subject: "Update for {{vendorName}}", text: "Hello {{vendorName}}", html: "<p>Hello {{vendorName}}</p>" })
  const [preview, setPreview] = useState("")
  function load() { api<Template[]>("/api/email/templates").then(setRows).catch((error) => toast.error(error.message)) }
  useEffect(() => { load() }, [])
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-medium">Email templates</h1>
      <Card className="grid gap-3 p-4">
        <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Name" />
        <Input value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} placeholder="Key" />
        <Select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
          <option value="transactional">Transactional</option>
          <option value="marketing">Marketing</option>
        </Select>
        <Input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
        <Textarea value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} />
        <Textarea value={form.html} onChange={(event) => setForm({ ...form, html: event.target.value })} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => {
            const data = await api<{ subject: string; text: string }>("/api/email/templates/preview", { method: "POST", body: JSON.stringify(form) })
            setPreview(`${data.subject}\n\n${data.text}`)
          }}>Preview</Button>
          <Button onClick={async () => { await api("/api/email/templates", { method: "POST", body: JSON.stringify(form) }); toast.success("Template saved."); load() }}>Save template</Button>
        </div>
        {preview && <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{preview}</pre>}
      </Card>
      <Card className="divide-y divide-border">
        {rows.map((row) => <button key={row.id} className="block w-full px-4 py-3 text-left hover:bg-muted" onClick={() => setForm(row)}><div className="font-medium">{row.name}</div><div className="text-sm text-muted-foreground">{row.key} · {row.category}</div></button>)}
      </Card>
    </div>
  )
}

export function EmailMessageSearch() {
  const [q, setQ] = useState("")
  const [rows, setRows] = useState<Message[]>([])
  async function search() {
    setRows(await api<Message[]>(`/api/email/messages?q=${encodeURIComponent(q)}`))
  }
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-medium">Email messages</h1>
      <div className="flex gap-2"><Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="vendor@example.com" className="max-w-sm" /><Button onClick={() => search().catch((error) => toast.error(error.message))}>Search</Button></div>
      <Card className="divide-y divide-border">
        {rows.map((row) => <Link key={row.id} href={`/admin/email/messages/${row.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted"><span>{row.recipientEmail}</span><Badge value={row.status} /></Link>)}
      </Card>
    </div>
  )
}

export function SuppressionList() {
  const [rows, setRows] = useState<{ id: string; email: string; reason: string; bounceType?: string | null }[]>([])
  const [unsubscribed, setUnsubscribed] = useState<{ id: string; email: string; category: string }[]>([])
  function load() {
    api<{ suppressed: typeof rows; unsubscribed: typeof unsubscribed }>("/api/email/suppressions").then((data) => {
      setRows(data.suppressed)
      setUnsubscribed(data.unsubscribed)
    }).catch((error) => toast.error(error.message))
  }
  useEffect(() => { load() }, [])
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium">Suppression list</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Hard bounces and complaints stop future marketing mail. Transactional messages such as approvals, purchase orders, and compliance requests stay available unless you remove the address here.</p>
      </div>
      <Card className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div><div className="font-medium">{row.email}</div><div className="text-sm text-muted-foreground">{row.reason} {row.bounceType ? `· ${row.bounceType}` : ""}</div></div>
            <Button size="sm" variant="outline" onClick={async () => { await api(`/api/email/suppressions/${row.id}`, { method: "DELETE" }); load() }}>Remove</Button>
          </div>
        ))}
        {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">No suppressed addresses.</p>}
      </Card>
      <Card className="divide-y divide-border">
        <div className="px-4 py-3 font-medium">Marketing unsubscribes</div>
        {unsubscribed.map((row) => <div key={row.id} className="px-4 py-3 text-sm">{row.email} · {row.category}</div>)}
        {unsubscribed.length === 0 && <p className="p-4 text-sm text-muted-foreground">No marketing unsubscribes.</p>}
      </Card>
    </div>
  )
}

export function QueueMonitor() {
  const [data, setData] = useState<{ queues: Record<string, Record<string, number>>; completedLastMinute: number } | null>(null)
  const [dead, setDead] = useState<{ id: string; name: string; lastError?: string | null; attempts: number }[]>([])
  async function load() {
    const summary = await api<NonNullable<typeof data>>("/api/queues")
    setData(summary)
    setDead(await api(`/api/queues/email/jobs?status=DEAD`))
  }
  useEffect(() => { load().catch((error) => toast.error(error.message)) }, [])
  useEffect(() => {
    const stream = new EventSource("/api/email/stream")
    stream.addEventListener("queue:status", () => { load().catch(() => undefined) })
    return () => stream.close()
  }, [])
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium">Queues</h1>
        <p className="mt-1 text-sm text-muted-foreground">Completed in the last minute: {data?.completedLastMinute || 0}. Jobs stay in PostgreSQL. Redis is used as well when a Redis URL is saved in email settings.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(data?.queues || {}).map(([queue, counts]) => (
          <Card key={queue} className="p-4">
            <h2 className="font-medium capitalize">{queue}</h2>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              {Object.entries(counts).map(([status, count]) => <div key={status} className="flex justify-between"><span>{status.toLowerCase()}</span><span>{count}</span></div>)}
            </div>
          </Card>
        ))}
      </div>
      <Card className="space-y-3 p-4">
        <h2 className="font-medium">Dead letter · email</h2>
        {dead.map((job) => (
          <div key={job.id} className="flex items-center justify-between gap-3 text-sm">
            <div><div className="font-medium">{job.name}</div><div className="text-muted-foreground">{job.lastError}</div></div>
            <Button size="sm" variant="outline" onClick={async () => { await api("/api/queues/email/retry", { method: "POST", body: JSON.stringify({ jobId: job.id }) }); toast.success("Job queued again."); load() }}>Retry</Button>
          </div>
        ))}
        {dead.length === 0 && <p className="text-sm text-muted-foreground">No dead-letter email jobs.</p>}
      </Card>
    </div>
  )
}
