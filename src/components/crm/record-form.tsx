"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { moduleByKey, type FieldConfig } from "@/config/modules"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label, Select, Textarea } from "@/components/ui/input"
import { api } from "@/lib/api-client"
import { labelize } from "@/lib/format"
import { can } from "@/lib/permissions"
import type { PublicUser } from "@/lib/types"

export type Lookups = {
  vendors?: { id: string; legalName: string }[]
  events?: { id: string; name: string }[]
  categories?: { id: string; name: string }[]
  terms?: { id: string; name: string }[]
  emirates?: { name: string }[]
  users?: { id: string; name: string }[]
  documentTypes?: { id: string; name: string }[]
  roles?: { id: string; name: string }[]
  rfqs?: { id: string; number: string; title: string }[]
}

export function newRecordPath(portal: "admin" | "vendor", moduleKey: string) {
  if (portal === "admin" && moduleKey === "vendors") return "/admin/vendors/new"
  return `/${portal}/new/${moduleKey}`
}

export function RecordForm({ portal, moduleKey, user }: { portal: "admin" | "vendor"; moduleKey: string; user: PublicUser }) {
  const router = useRouter()
  const config = moduleByKey(moduleKey)
  const listHref = `/${portal}/${moduleKey}`
  const [form, setForm] = useState<Record<string, string>>({})
  const [lines, setLines] = useState([{ description: "", quantity: "1", unitPrice: "0" }])
  const [vendorIds, setVendorIds] = useState<string[]>([])
  const [lookups, setLookups] = useState<Lookups>({})
  const [fileId, setFileId] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<Lookups>("/api/lookups").then(setLookups).catch(() => undefined)
    if (moduleKey === "quotations") {
      api<{ id: string; number: string; title: string }[]>("/api/rfqs?pageSize=50")
        .then((data) => setLookups((current) => ({ ...current, rfqs: data })))
        .catch(() => undefined)
    }
  }, [moduleKey])

  if (!config) {
    return <Card className="p-8"><h1 className="text-xl font-medium">This page is not available</h1></Card>
  }

  const allowed = portal === "vendor" ? Boolean(config.vendorCreatable) && can(user, config.permission, "CREATE") : Boolean(config.creatable) && can(user, config.permission, "CREATE")
  if (!allowed) {
    return (
      <Card className="p-8">
        <h1 className="text-xl font-medium">You cannot create this record</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your role does not include create access for {config.title.toLowerCase()}.</p>
        <Button className="mt-4" variant="outline" asChild><Link href={listHref}>Back</Link></Button>
      </Card>
    )
  }

  const title = moduleKey === "vendors" ? "Register a vendor" : `New ${config.title.toLowerCase().replace(/s$/, "")}`

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!config) return
    const payload: Record<string, unknown> = { ...form }
    for (const field of config.fields) {
      if (field.type === "number") payload[field.name] = form[field.name] ? Number(form[field.name]) : undefined
      if (field.asArray) payload[field.name] = form[field.name] ? [form[field.name]] : []
      if (!form[field.name] && field.type !== "lines" && field.type !== "vendors") delete payload[field.name]
    }
    if (config.fields.some((field) => field.type === "lines")) {
      payload.items = lines.filter((line) => line.description).map((line) => ({ description: line.description, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) }))
    }
    if (config.fields.some((field) => field.type === "vendors")) payload.vendorIds = vendorIds
    if (fileId) payload.fileAssetId = fileId
    if (portal === "vendor") delete payload.vendorId
    setSaving(true)
    try {
      const created = await api<{ notice?: string; temporaryPassword?: string }>(config.api, { method: "POST", body: JSON.stringify(payload) })
      toast.success(created?.notice || "Record created.")
      if (created?.temporaryPassword) toast.message(`Temporary password: ${created.temporaryPassword}`, { duration: 20000 })
      router.push(listHref)
      router.refresh()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">
          <Link href={listHref} className="hover:underline">{config.title}</Link>
        </p>
        <h1 className="text-xl font-medium">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{config.description}</p>
      </div>
      <Card className="p-6">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
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
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button type="button" variant="outline" asChild><Link href={listHref}>Cancel</Link></Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving" : moduleKey === "vendors" ? "Register vendor" : "Save"}</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

export function Field({ field, form, setForm, lookups, vendorIds, setVendorIds, lines, setLines }: {
  field: FieldConfig
  form: Record<string, string>
  setForm: (value: Record<string, string>) => void
  lookups: Lookups
  vendorIds: string[]
  setVendorIds: (value: string[]) => void
  lines: { description: string; quantity: string; unitPrice: string }[]
  setLines: (value: { description: string; quantity: string; unitPrice: string }[]) => void
}) {
  const wide = field.type === "textarea" || field.type === "lines" || field.type === "vendors"
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <Label>{field.label}</Label>
      <div className="mt-1">
        {field.type === "textarea" ? <Textarea value={form[field.name] || ""} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })} /> : null}
        {field.type === "select" ? (
          <Select value={form[field.name] || ""} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}>
            <option value="">Select</option>
            {field.options?.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}
          </Select>
        ) : null}
        {field.type === "lookup" ? (
          <Select value={form[field.name] || ""} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}>
            <option value="">Select</option>
            {optionsFor(field, lookups).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        ) : null}
        {field.type === "vendors" ? (
          <div className="max-h-40 space-y-1 overflow-auto rounded-[3px] border border-border p-2">
            {(lookups.vendors || []).map((vendor) => (
              <label key={vendor.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={vendorIds.includes(vendor.id)} onChange={(event) => setVendorIds(event.target.checked ? [...vendorIds, vendor.id] : vendorIds.filter((id) => id !== vendor.id))} />
                {vendor.legalName}
              </label>
            ))}
          </div>
        ) : null}
        {field.type === "lines" ? (
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-3 gap-2">
                <Input placeholder="Description" value={line.description} onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} />
                <Input placeholder="Qty" type="number" value={line.quantity} onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} />
                <Input placeholder="Price" type="number" value={line.unitPrice} onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: event.target.value } : item))} />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { description: "", quantity: "1", unitPrice: "0" }])}>Add line</Button>
          </div>
        ) : null}
        {["text", "number", "date", "email"].includes(field.type) ? (
          <Input type={field.type === "text" ? "text" : field.type} required={field.required} value={form[field.name] || ""} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })} />
        ) : null}
      </div>
    </div>
  )
}

function optionsFor(field: FieldConfig, lookups: Lookups) {
  if (field.lookup === "vendors") return (lookups.vendors || []).map((item) => ({ value: item.id, label: item.legalName }))
  if (field.lookup === "events") return (lookups.events || []).map((item) => ({ value: item.id, label: item.name }))
  if (field.lookup === "categories") return (lookups.categories || []).map((item) => ({ value: item.id, label: item.name }))
  if (field.lookup === "terms") return (lookups.terms || []).map((item) => ({ value: item.id, label: item.name }))
  if (field.lookup === "emirates") return (lookups.emirates || []).map((item) => ({ value: item.name, label: item.name }))
  if (field.lookup === "users") return (lookups.users || []).map((item) => ({ value: item.id, label: item.name }))
  if (field.lookup === "documentTypes") return (lookups.documentTypes || []).map((item) => ({ value: item.id, label: item.name }))
  if (field.lookup === "roles") return (lookups.roles || []).map((item) => ({ value: item.id, label: item.name }))
  if (field.lookup === "rfqs") return (lookups.rfqs || []).map((item) => ({ value: item.id, label: item.number ? `${item.number} · ${item.title}` : item.title }))
  return []
}
