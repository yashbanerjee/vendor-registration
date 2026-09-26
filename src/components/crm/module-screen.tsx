"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { moduleByKey } from "@/config/modules"
import { Field, newRecordPath, type Lookups } from "@/components/crm/record-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input, Label, Select, Textarea } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiClientError, api, apiWithMeta } from "@/lib/api-client"
import { formatDate, formatMoney, getPath, labelize } from "@/lib/format"
import { can } from "@/lib/permissions"
import type { PublicUser } from "@/lib/types"

type Row = Record<string, unknown> & { id?: string }

export function ModuleScreen({ portal, moduleKey, user, currency = "AED" }: { portal: "admin" | "vendor"; moduleKey: string; user: PublicUser; currency?: string }) {
  const config = moduleByKey(moduleKey === "support" ? "support" : moduleKey)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(moduleKey === "compliance" ? "EXPIRING_SOON" : "")
  const [sort, setSort] = useState("createdAt")
  const [dir, setDir] = useState<"asc" | "desc">("desc")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [lines, setLines] = useState([{ description: "", quantity: "1", unitPrice: "0" }])
  const [vendorIds, setVendorIds] = useState<string[]>([])
  const [lookups, setLookups] = useState<Lookups>({})
  const [hidden, setHidden] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [qr, setQr] = useState<{ code: string; dataUrl: string } | null>(null)
  const [assignEvent, setAssignEvent] = useState<Row | null>(null)
  const [assignment, setAssignment] = useState({ vendorId: "", category: "", service: "", scope: "" })
  const [compare, setCompare] = useState<Row[] | null>(null)
  const [fileId, setFileId] = useState("")

  const pageSize = 20
  const canCreate = portal === "vendor" ? Boolean(config?.vendorCreatable) && can(user, config?.permission || "", "CREATE") : Boolean(config?.creatable) && can(user, config?.permission || "", "CREATE")
  const canEdit = portal === "vendor" ? Boolean(config?.vendorEditable) && can(user, config?.permission || "", "EDIT") : Boolean(config?.editable) && can(user, config?.permission || "", "EDIT")

  useEffect(() => {
    const stored = localStorage.getItem(`cols:${moduleKey}`)
    if (stored) setHidden(JSON.parse(stored))
    api<Lookups>("/api/lookups").then(setLookups).catch(() => undefined)
    if (moduleKey === "quotations") {
      api<Row[]>("/api/rfqs?pageSize=50").then((data) => setLookups((current) => ({ ...current, rfqs: data as Lookups["rfqs"] }))).catch(() => undefined)
    }
  }, [moduleKey])

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q), 300)
    return () => clearTimeout(timer)
  }, [q])

  async function load() {
    if (!config) return
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), q: search, sort, dir })
      if (status) params.set("status", status)
      const response = await apiWithMeta<Row[]>(`${config.api}${config.api.includes("?") ? "&" : "?"}${params}`)
      setRows(Array.isArray(response.data) ? response.data : [])
      setTotal(response.meta?.total || 0)
    } catch (reason) {
      setError(reason instanceof ApiClientError ? reason.message : "Could not load this page.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey, page, search, status, sort, dir])

  const columns = useMemo(() => config?.columns.filter((column) => !hidden.includes(column.key)) || [], [config, hidden])

  if (!config) {
    return <Card className="p-8"><h1 className="text-xl font-semibold">This page is not available</h1><p className="mt-2 text-sm text-muted-foreground">The module is not part of this workspace.</p></Card>
  }

  function openEdit(row: Row) {
    const next: Record<string, string> = {}
    for (const field of config!.fields) {
      const value = getPath(row, field.name)
      if (value != null && typeof value !== "object") next[field.name] = String(value)
    }
    setForm(next)
    const items = Array.isArray(row.items) ? (row.items as { description: string; quantity: number; unitPrice: number }[]) : []
    setLines(items.length ? items.map((item) => ({ description: item.description, quantity: String(item.quantity), unitPrice: String(item.unitPrice) })) : [{ description: "", quantity: "1", unitPrice: "0" }])
    setEditing(row)
    setOpen(true)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const payload: Record<string, unknown> = { ...form }
    for (const field of config!.fields) {
      if (field.type === "number") payload[field.name] = form[field.name] ? Number(form[field.name]) : undefined
      if (field.asArray) payload[field.name] = form[field.name] ? [form[field.name]] : []
      if (!form[field.name] && field.type !== "lines" && field.type !== "vendors") delete payload[field.name]
    }
    if (config!.fields.some((field) => field.type === "lines")) {
      payload.items = lines.filter((line) => line.description).map((line) => ({ description: line.description, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) }))
    }
    if (config!.fields.some((field) => field.type === "vendors")) payload.vendorIds = vendorIds
    if (fileId) payload.fileAssetId = fileId
    if (portal === "vendor") delete payload.vendorId
    try {
      const method = editing?.id ? "PATCH" : "POST"
      const url = editing?.id ? `${config!.api}/${editing.id}` : config!.api
      const created = await api<{ notice?: string; temporaryPassword?: string }>(url, { method, body: JSON.stringify(payload) })
      toast.success(created?.notice || (editing ? "Record updated." : "Record created."))
      if (created?.temporaryPassword) toast.message(`Temporary password: ${created.temporaryPassword}`)
      setOpen(false)
      load()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save.")
    }
  }

  async function review(id: string, action: string, path: string) {
    try {
      const body = path.endsWith("/status") ? { status: action } : { action }
      await api(path, { method: "POST", body: JSON.stringify(body) })
      toast.success("Updated.")
      load()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not update.")
    }
  }

  async function remove(id: string) {
    if (!confirm("Archive this record?")) return
    try {
      await api(`${config.api}/${id}`, { method: "DELETE" })
      toast.success("Archived.")
      load()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not archive.")
    }
  }

  function renderValue(row: Row, key: string, kind?: string) {
    const value = getPath(row, key)
    if (kind === "status") return <Badge value={String(value || "")} />
    if (kind === "date") return formatDate(value)
    if (kind === "money") return formatMoney(value, currency)
    if (key === "complianceScore") return `${value ?? 0}%`
    if (moduleKey === "vendors" && key === "legalName" && portal === "admin") {
      return <Link className="font-medium underline-offset-4 hover:underline" href={`/admin/vendors/${row.id}`}>{String(value || "—")}</Link>
    }
    return value == null || value === "" ? "—" : String(value)
  }

  const visibleColumns = columns

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{portal === "admin" ? "Workspace" : "Vendor portal"}</p>
          <h1 className="text-xl font-medium">{config.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{config.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {moduleKey === "vendors" && portal === "admin" && can(user, "vendors", "CREATE") && <Button variant="outline" asChild><Link href="/admin/vendors/import">Bulk import</Link></Button>}
          {moduleKey === "quotations" && portal === "admin" && (
            <Button variant="outline" onClick={async () => {
              const rfqId = prompt("RFQ id to compare")
              if (!rfqId) return
              const data = await api<Row[]>(`/api/quotations?rfqId=${rfqId}&pageSize=50`)
              setCompare(data)
            }}>Compare quotes</Button>
          )}
          {moduleKey === "gate-passes" && portal === "admin" && <Button variant="outline" asChild><Link href="/admin/gate-passes/scan">Scan a pass</Link></Button>}
          {canCreate && <Button asChild><Link href={newRecordPath(portal, moduleKey)}>{moduleKey === "vendors" ? "Register vendor" : "New"}</Link></Button>}
        </div>
      </div>

      <Card className="p-3">
        <div className="flex flex-col gap-2 md:flex-row">
          <Input value={q} onChange={(event) => { setPage(1); setQ(event.target.value) }} placeholder="Search" className="md:max-w-xs" />
          {config.statuses && (
            <Select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value) }} className="md:max-w-52">
              <option value="">All statuses</option>
              {config.statuses.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}
            </Select>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline">Columns</Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              {config.columns.map((column) => (
                <DropdownMenuItem key={column.key} onClick={() => {
                  const next = hidden.includes(column.key) ? hidden.filter((item) => item !== column.key) : [...hidden, column.key]
                  setHidden(next)
                  localStorage.setItem(`cols:${moduleKey}`, JSON.stringify(next))
                }}>
                  {hidden.includes(column.key) ? "Show" : "Hide"} {column.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {selected.length > 0 && config.deletable && can(user, config.permission, "DELETE") && (
            <Button variant="destructive" onClick={async () => {
              for (const id of selected) await api(`${config.api}/${id}`, { method: "DELETE" }).catch(() => undefined)
              setSelected([])
              load()
            }}>Archive {selected.length}</Button>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
      ) : error ? (
        <Card className="p-8">
          <h2 className="font-medium">This list could not be loaded</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" variant="outline" onClick={load}>Try again</Button>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <h2 className="font-medium">Nothing here yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Records will appear after they are created or submitted.</p>
          {canCreate && <Button className="mt-4" asChild><Link href={newRecordPath(portal, moduleKey)}>{moduleKey === "vendors" ? "Register a vendor" : "Create the first record"}</Link></Button>}
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {config.deletable && <TableHead />}
                  {visibleColumns.map((column) => (
                    <TableHead key={column.key}>
                      <button onClick={() => { setSort(column.key.split(".")[0]); setDir(dir === "asc" ? "desc" : "asc") }}>{column.label}</button>
                    </TableHead>
                  ))}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={String(row.id)}>
                    {config.deletable && (
                      <TableCell>
                        <input type="checkbox" checked={selected.includes(String(row.id))} onChange={(event) => setSelected(event.target.checked ? [...selected, String(row.id)] : selected.filter((id) => id !== row.id))} />
                      </TableCell>
                    )}
                    {visibleColumns.map((column) => <TableCell key={column.key}>{renderValue(row, column.key, column.kind)}</TableCell>)}
                    <TableCell className="text-right"><RowMenu portal={portal} moduleKey={moduleKey} row={row} user={user} canEdit={canEdit} onEdit={() => openEdit(row)} onRemove={() => row.id && remove(String(row.id))} onReview={review} onQr={async () => setQr(await api(`/api/gate-passes/${row.id}/qr`))} onAssign={() => { setAssignment({ vendorId: "", category: "", service: "", scope: "" }); setAssignEvent(row) }} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </Card>
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <Card key={String(row.id)} className="space-y-2 p-4">
                {visibleColumns.slice(0, 4).map((column) => (
                  <div key={column.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{column.label}</span>
                    <span className="text-right">{renderValue(row, column.key, column.kind)}</span>
                  </div>
                ))}
                <RowMenu portal={portal} moduleKey={moduleKey} row={row} user={user} canEdit={canEdit} onEdit={() => openEdit(row)} onRemove={() => row.id && remove(String(row.id))} onReview={review} onQr={async () => setQr(await api(`/api/gate-passes/${row.id}/qr`))} onAssign={() => { setAssignment({ vendorId: "", category: "", service: "", scope: "" }); setAssignEvent(row) }} />
              </Card>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} records</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page * pageSize >= total} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {config.title.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
            {config.fields.map((field) => (
              <Field key={field.name} field={field} form={form} setForm={setForm} lookups={lookups} vendorIds={vendorIds} setVendorIds={setVendorIds} lines={lines} setLines={setLines} />
            ))}
            {moduleKey === "documents" && (
              <div className="md:col-span-2">
                <Label>File</Label>
                <Input className="mt-1" type="file" onChange={async (event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  const body = new FormData()
                  body.set("file", file)
                  const response = await fetch("/api/uploads", { method: "POST", body })
                  const payload = await response.json()
                  if (!payload.success) return toast.error(payload.message)
                  setFileId(payload.data.id)
                  toast.success("File attached.")
                }} />
              </div>
            )}
            <DialogFooter className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(assignEvent)} onOpenChange={() => setAssignEvent(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign vendor to {String(assignEvent?.name || "event")}</DialogTitle></DialogHeader>
          <form className="grid gap-3" onSubmit={async (event) => {
            event.preventDefault()
            if (!assignEvent?.id || !assignment.vendorId) return
            await api(`/api/events/${assignEvent.id}/vendors`, { method: "POST", body: JSON.stringify(assignment) })
            toast.success("Vendor assigned to the event.")
            setAssignEvent(null)
          }}>
            <Label>Vendor</Label>
            <Select value={assignment.vendorId} onChange={(event) => setAssignment({ ...assignment, vendorId: event.target.value })} required>
              <option value="">Select a vendor</option>
              {(lookups.vendors || []).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.legalName}</option>)}
            </Select>
            <Label>Category</Label>
            <Input value={assignment.category} onChange={(event) => setAssignment({ ...assignment, category: event.target.value })} />
            <Label>Service</Label>
            <Input value={assignment.service} onChange={(event) => setAssignment({ ...assignment, service: event.target.value })} />
            <Label>Scope</Label>
            <Textarea value={assignment.scope} onChange={(event) => setAssignment({ ...assignment, scope: event.target.value })} />
            <DialogFooter><Button type="submit">Assign</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(qr)} onOpenChange={() => setQr(null)}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader><DialogTitle>{qr?.code}</DialogTitle></DialogHeader>
          {qr && <img src={qr.dataUrl} alt={`QR code for ${qr.code}`} className="mx-auto" />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(compare)} onOpenChange={() => setCompare(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Quotation comparison</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            {(compare || []).map((quote) => (
              <Card key={String(quote.id)} className="p-4">
                <div className="flex items-center justify-between"><strong>{String(quote.number)}</strong><Badge value={String(quote.status)} /></div>
                <p className="mt-2 text-sm text-muted-foreground">{String(getPath(quote, "vendor.legalName") || "")}</p>
                <p className="mt-3 text-lg">{formatMoney(quote.total, currency)}</p>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RowMenu({ portal, moduleKey, row, user, canEdit, onEdit, onRemove, onReview, onQr, onAssign }: {
  portal: "admin" | "vendor"
  moduleKey: string
  row: Row
  user: PublicUser
  canEdit: boolean
  onEdit: () => void
  onRemove: () => void
  onReview: (id: string, action: string, path: string) => void
  onQr: () => void
  onAssign: () => void
}) {
  const id = String(row.id || "")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">Actions</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>}
        {moduleKey === "vendors" && portal === "admin" && can(user, "vendors", "APPROVE") && (
          <>
            <DropdownMenuItem onClick={() => onReview(id, "APPROVE", `/api/vendors/${id}/review`)}>Approve step</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReview(id, "CHANGES", `/api/vendors/${id}/review`)}>Request changes</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReview(id, "REJECT", `/api/vendors/${id}/review`)}>Reject</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReview(id, "ACTIVATE", `/api/vendors/${id}/review`)}>Activate</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReview(id, "SUSPEND", `/api/vendors/${id}/review`)}>Suspend</DropdownMenuItem>
          </>
        )}
        {moduleKey === "applications" && can(user, "vendors", "APPROVE") && <DropdownMenuItem onClick={() => onReview(id, "APPROVE", `/api/vendors/${id}/review`)}>Review and approve</DropdownMenuItem>}
        {moduleKey === "documents" && can(user, "documents", "APPROVE") && (
          <>
            <DropdownMenuItem onClick={() => onReview(id, "APPROVE", `/api/vendor-documents/${id}/review`)}>Approve</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReview(id, "REJECT", `/api/vendor-documents/${id}/review`)}>Reject</DropdownMenuItem>
          </>
        )}
        {moduleKey === "invoices" && can(user, "invoices", "APPROVE") && (
          <>
            <DropdownMenuItem onClick={() => onReview(id, "APPROVE", `/api/invoices/${id}/review`)}>Approve</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReview(id, "CHANGES", `/api/invoices/${id}/review`)}>Request changes</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReview(id, "REJECT", `/api/invoices/${id}/review`)}>Reject</DropdownMenuItem>
          </>
        )}
        {moduleKey === "quotations" && portal === "admin" && can(user, "quotations", "APPROVE") && <DropdownMenuItem onClick={() => onReview(id, "ACCEPTED", `/api/quotations/${id}/status`)}>Accept</DropdownMenuItem>}
        {moduleKey === "rfqs" && portal === "vendor" && (
          <>
            <DropdownMenuItem onClick={() => onReview(id, "ACCEPT", `/api/rfqs/${id}/respond`)}>Accept RFQ</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReview(id, "DECLINE", `/api/rfqs/${id}/respond`)}>Decline RFQ</DropdownMenuItem>
          </>
        )}
        {moduleKey === "workforce" && can(user, "workforce", "APPROVE") && <DropdownMenuItem onClick={() => onReview(id, "APPROVE", `/api/workforce/${id}/review`)}>Approve worker</DropdownMenuItem>}
        {moduleKey === "purchase-orders" && <DropdownMenuItem asChild><a href={`/api/purchase-orders/${id}/pdf`}>Download PDF</a></DropdownMenuItem>}
        {moduleKey === "gate-passes" && <DropdownMenuItem onClick={onQr}>Show QR</DropdownMenuItem>}
        {portal === "admin" && moduleKey === "vendors" && can(user, "vendors", "DELETE") && <DropdownMenuItem onClick={onRemove}>Archive</DropdownMenuItem>}
        {moduleKey === "events" && portal === "admin" && can(user, "events", "EDIT") && <DropdownMenuItem onClick={onAssign}>Assign vendor</DropdownMenuItem>}
        {moduleKey === "events" && can(user, "events", "DELETE") && <DropdownMenuItem onClick={onRemove}>Archive</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
