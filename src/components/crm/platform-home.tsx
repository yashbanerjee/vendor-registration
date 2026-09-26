"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { RecordTable } from "@/components/crm/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label, Select } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/api-client"

type Org = { id: string; name: string; code: string; status: string; createdAt: string; _count?: { users: number; teams: number } }
type Admin = { id: string; name: string; email: string; phone?: string | null; status: string; identityUserId?: string | null; organization?: { name: string } | null; createdAt: string; lastLoginAt?: string | null }

function when(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" })
}

export function PlatformHome() {
  const [summary, setSummary] = useState<{ organizations: number; admins: number; queuedJobs: number } | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  useEffect(() => {
    api<typeof summary>("/api/platform/summary").then(setSummary).catch((error) => toast.error(error.message))
    api<Org[]>("/api/organizations").then(setOrgs).catch((error) => toast.error(error.message))
  }, [])
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
      <RecordTable
        rows={orgs}
        empty="No organizations yet."
        rowKey={(row) => row.id}
        columns={[
          { header: "Organization", className: "font-medium", cell: (row) => row.name },
          { header: "Code", cell: (row) => row.code },
          { header: "Status", cell: (row) => <Badge value={row.status} /> },
          { header: "Users", cell: (row) => row._count?.users || 0 },
          { header: "Teams", cell: (row) => row._count?.teams || 0 },
          { header: "Created", cell: (row) => when(row.createdAt) },
        ]}
      />
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
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Teams</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.code}</TableCell>
                  <TableCell><Badge value={row.status} /></TableCell>
                  <TableCell>{row._count?.users || 0}</TableCell>
                  <TableCell>{row._count?.teams || 0}</TableCell>
                  <TableCell>{when(row.createdAt)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No organizations yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
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
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Identity</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.email}</TableCell>
                  <TableCell>{row.phone || "—"}</TableCell>
                  <TableCell>{row.organization?.name || "—"}</TableCell>
                  <TableCell><Badge value={row.status} /></TableCell>
                  <TableCell>{when(row.createdAt)}</TableCell>
                  <TableCell>{when(row.lastLoginAt)}</TableCell>
                  <TableCell className="max-w-[140px] truncate font-mono text-xs" title={row.identityUserId || ""}>{row.identityUserId || "Pending"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={async () => { await api(`/api/admins/${row.id}/status`, { method: "POST", body: JSON.stringify({ status: row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }) }); load() }}>{row.status === "ACTIVE" ? "Deactivate" : "Activate"}</Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-muted-foreground">No organization admins yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}

export function TeamsPage() {
  const [rows, setRows] = useState<{ id: string; name: string; code: string; description?: string | null; status: string; createdAt: string; memberships: { id: string; isTeamAdmin: boolean; user: { name: string; email: string; status: string } }[] }[]>([])
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
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Team admin</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((team) => {
                const admins = team.memberships.filter((member) => member.isTeamAdmin).map((member) => member.user.name)
                return (
                  <TableRow key={team.id}>
                    <TableCell className="font-medium">{team.name}</TableCell>
                    <TableCell>{team.code}</TableCell>
                    <TableCell>{team.description || "—"}</TableCell>
                    <TableCell><Badge value={team.status} /></TableCell>
                    <TableCell>{team.memberships.length}</TableCell>
                    <TableCell>{admins.length ? admins.join(", ") : "—"}</TableCell>
                    <TableCell>{when(team.createdAt)}</TableCell>
                  </TableRow>
                )
              })}
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No teams yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Card>
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
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current level</TableHead>
                <TableHead>Comment</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.workflow.name}</TableCell>
                  <TableCell>{row.entityType}</TableCell>
                  <TableCell>{row.vendor?.legalName || "—"}</TableCell>
                  <TableCell>AED {Number(row.amount || 0).toLocaleString("en-AE")}</TableCell>
                  <TableCell><Badge value={row.status} /></TableCell>
                  <TableCell>{row.workflow.steps[row.currentStep]?.name || "Done"} · {row.currentStep + 1}/{row.workflow.steps.length || 1}</TableCell>
                  <TableCell><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Comment" /></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={async () => { await api(`/api/approvals/${row.id}`, { method: "POST", body: JSON.stringify({ action: "APPROVE", note }) }); load() }}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={async () => { await api(`/api/approvals/${row.id}`, { method: "POST", body: JSON.stringify({ action: "CHANGES", note }) }); load() }}>Changes</Button>
                      <Button size="sm" variant="outline" onClick={async () => { await api(`/api/approvals/${row.id}`, { method: "POST", body: JSON.stringify({ action: "REJECT", note }) }); load() }}>Reject</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-muted-foreground">No approvals are waiting.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
