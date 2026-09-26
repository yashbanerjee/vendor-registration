"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label, Select } from "@/components/ui/input"
import { api } from "@/lib/api-client"

type Org = { id: string; name: string; code: string; status: string; _count?: { users: number; teams: number } }
type Admin = { id: string; name: string; email: string; phone?: string | null; status: string; identityUserId?: string | null; organization?: { name: string } | null; createdAt: string; lastLoginAt?: string | null }

export function PlatformHome() {
  const [summary, setSummary] = useState<{ organizations: number; admins: number; queuedJobs: number } | null>(null)
  useEffect(() => { api<typeof summary>("/api/platform/summary").then(setSummary).catch((error) => toast.error(error.message)) }, [])
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-medium">Platform</h1>
        <p className="mt-1 text-sm text-muted-foreground">Organizations, admin accounts, features, and infrastructure. Organization business records stay in each organization workspace.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Organizations</div><div className="text-2xl font-medium">{summary?.organizations ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Organization admins</div><div className="text-2xl font-medium">{summary?.admins ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Queued or dead jobs</div><div className="text-2xl font-medium">{summary?.queuedJobs ?? "—"}</div></Card>
      </div>
    </div>
  )
}

export function OrganizationsPage() {
  const [rows, setRows] = useState<Org[]>([])
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  function load() { api<Org[]>("/api/organizations").then(setRows).catch((error) => toast.error(error.message)) }
  useEffect(() => { load() }, [])
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium">Organizations</h1>
      <Card className="grid gap-3 p-4 md:grid-cols-3">
        <div><Label>Name</Label><Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div><Label>Code</Label><Input className="mt-1" value={code} onChange={(event) => setCode(event.target.value)} /></div>
        <Button className="self-end" onClick={async () => { await api("/api/organizations", { method: "POST", body: JSON.stringify({ name, code }) }); setName(""); setCode(""); load() }}>Add organization</Button>
      </Card>
      <Card className="divide-y divide-border">
        {rows.map((row) => <div key={row.id} className="flex items-center justify-between px-4 py-3"><div><div className="font-medium">{row.name}</div><div className="text-sm text-muted-foreground">{row.code} · {row._count?.users || 0} users · {row._count?.teams || 0} teams</div></div><span className="text-sm">{row.status}</span></div>)}
      </Card>
    </div>
  )
}

export function AdminsPage() {
  const [rows, setRows] = useState<Admin[]>([])
  const [orgs, setOrgs] = useState<Org[]>([])
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", organizationId: "" })
  function load() {
    api<Admin[]>("/api/admins").then(setRows).catch((error) => toast.error(error.message))
    api<Org[]>("/api/organizations").then(setOrgs).catch(() => undefined)
  }
  useEffect(() => { load() }, [])
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium">Admins</h1>
      <Card className="grid gap-3 p-4 md:grid-cols-2">
        <Input placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <Input placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <Input placeholder="Mobile" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <Input placeholder="Temporary password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <Select value={form.organizationId} onChange={(event) => setForm({ ...form, organizationId: event.target.value })}>
          <option value="">Organization</option>
          {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
        </Select>
        <Button onClick={async () => { await api("/api/admins", { method: "POST", body: JSON.stringify(form) }); toast.success("Admin created."); setForm({ name: "", email: "", phone: "", password: "", organizationId: form.organizationId }); load() }}>Add admin</Button>
      </Card>
      <Card className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="font-medium">{row.name}</div>
              <div className="text-sm text-muted-foreground">{row.email} · {row.organization?.name || "No organization"} · {row.identityUserId ? "Identity linked" : "Identity pending"}</div>
            </div>
            <Button size="sm" variant="outline" onClick={async () => { await api(`/api/admins/${row.id}/status`, { method: "POST", body: JSON.stringify({ status: row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }) }); load() }}>{row.status === "ACTIVE" ? "Deactivate" : "Activate"}</Button>
          </div>
        ))}
      </Card>
    </div>
  )
}

export function TeamsPage() {
  const [rows, setRows] = useState<{ id: string; name: string; code: string; description?: string | null; status: string; memberships: { id: string; isTeamAdmin: boolean; user: { name: string; email: string; status: string } }[] }[]>([])
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  function load() { api<typeof rows>("/api/teams").then(setRows).catch((error) => toast.error(error.message)) }
  useEffect(() => { load() }, [])
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium">Teams</h1>
      <Card className="grid gap-3 p-4 md:grid-cols-3">
        <Input placeholder="Team name" value={name} onChange={(event) => setName(event.target.value)} />
        <Input placeholder="Code" value={code} onChange={(event) => setCode(event.target.value)} />
        <Button onClick={async () => { await api("/api/teams", { method: "POST", body: JSON.stringify({ name, code }) }); setName(""); setCode(""); load() }}>Add team</Button>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((team) => (
          <Card key={team.id} className="p-4">
            <div className="font-medium">{team.name}</div>
            <div className="text-sm text-muted-foreground">{team.code} · {team.status}</div>
            <div className="mt-3 space-y-1 text-sm">
              {team.memberships.map((member) => <div key={member.id}>{member.user.name} · {member.user.email}{member.isTeamAdmin ? " · Team admin" : ""}</div>)}
              {team.memberships.length === 0 && <div className="text-muted-foreground">No members yet.</div>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

export function ApprovalsPage() {
  const [rows, setRows] = useState<{ id: string; entityType: string; amount?: string | number | null; status: string; currentStep: number; vendor?: { legalName: string } | null; workflow: { name: string; steps: { name: string }[] }; actions: { id: string; action: string; note?: string | null; createdAt: string; actor?: { name: string } | null }[] }[]>([])
  const [note, setNote] = useState("")
  function load() { api<typeof rows>("/api/approvals").then(setRows).catch((error) => toast.error(error.message)) }
  useEffect(() => { load() }, [])
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium">Approvals</h1>
      <p className="text-sm text-muted-foreground">Pending {rows.length}. Each card shows the current level. Open tracking is not used here.</p>
      {rows.map((row) => (
        <Card key={row.id} className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{row.workflow.name}</div>
              <div className="text-sm text-muted-foreground">{row.entityType} · {row.vendor?.legalName || "Internal"} · AED {String(row.amount || 0)}</div>
            </div>
            <div className="text-sm">{row.workflow.steps[row.currentStep]?.name || "Done"}</div>
          </div>
          <div className="text-sm text-muted-foreground">{row.workflow.steps.map((step, index) => `${index < row.currentStep ? "Done" : index === row.currentStep ? "Pending" : "Waiting"} ${step.name}`).join(" · ")}</div>
          {row.actions.map((action) => <div key={action.id} className="text-sm">{action.actor?.name || "System"} · {action.action} · {new Date(action.createdAt).toLocaleString()} {action.note || ""}</div>)}
          <div className="flex gap-2">
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Comment" />
            <Button onClick={async () => { await api(`/api/approvals/${row.id}`, { method: "POST", body: JSON.stringify({ action: "APPROVE", note }) }); load() }}>Approve</Button>
            <Button variant="outline" onClick={async () => { await api(`/api/approvals/${row.id}`, { method: "POST", body: JSON.stringify({ action: "CHANGES", note }) }); load() }}>Request changes</Button>
            <Button variant="outline" onClick={async () => { await api(`/api/approvals/${row.id}`, { method: "POST", body: JSON.stringify({ action: "REJECT", note }) }); load() }}>Reject</Button>
          </div>
        </Card>
      ))}
      {rows.length === 0 && <Card className="p-4 text-sm text-muted-foreground">No approvals are waiting.</Card>}
    </div>
  )
}
