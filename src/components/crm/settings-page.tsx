"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { RecordTable } from "@/components/crm/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label, Select, Textarea } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api-client"
import { FIELD_TYPES } from "@/lib/constants"

export function SettingsPage({ initialTab = "general" }: { initialTab?: string }) {
  const [company, setCompany] = useState<Record<string, string>>({})
  const [tax, setTax] = useState<Record<string, string | number | boolean>>({})
  const [system, setSystem] = useState<{ key: string; value: unknown }[]>([])
  const [features, setFeatures] = useState<{ key: string; name: string; description?: string | null; enabled: boolean; group: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api<Record<string, string>>("/api/settings/company"),
      api<Record<string, string | number | boolean>>("/api/settings/tax"),
      api<{ key: string; value: unknown }[]>("/api/settings/system"),
      api<typeof features>("/api/features"),
    ]).then(([companyData, taxData, systemData, featureData]) => {
      setCompany(companyData || {})
      setTax(taxData || {})
      setSystem(systemData || [])
      setFeatures(featureData || [])
    }).catch((error) => toast.error(error.message)).finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton className="h-80" />

  async function saveCompany(event: React.FormEvent) {
    event.preventDefault()
    await api("/api/settings/company", { method: "PUT", body: JSON.stringify(company) })
    toast.success("Company profile saved.")
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">System settings</h1>
        <p className="text-sm text-muted-foreground">Company identity, UAE tax, workflows, and modules live here. The environment file only stores the database connection.</p>
      </div>
      <Tabs defaultValue={initialTab}>
        <TabsList className="flex h-auto flex-wrap">
          {["general", "uae", "vendor", "workflow", "notifications", "finance", "features", "branding", "integrations", "email"].map((tab) => <TabsTrigger key={tab} value={tab} className="capitalize">{tab}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="general">
          <form className="grid gap-3 md:grid-cols-2" onSubmit={saveCompany}>
            {["companyName", "legalName", "email", "phone", "website", "address", "emirate"].map((key) => (
              <div key={key}><Label className="capitalize">{key}</Label><Input className="mt-1" value={company[key] || ""} onChange={(event) => setCompany({ ...company, [key]: event.target.value })} /></div>
            ))}
            <div className="md:col-span-2"><Label>About</Label><Textarea className="mt-1" value={company.about || ""} onChange={(event) => setCompany({ ...company, about: event.target.value })} /></div>
            <div className="md:col-span-2"><Label>Privacy policy</Label><Textarea className="mt-1" value={company.privacyPolicy || ""} onChange={(event) => setCompany({ ...company, privacyPolicy: event.target.value })} /></div>
            <div className="md:col-span-2"><Label>Terms</Label><Textarea className="mt-1" value={company.terms || ""} onChange={(event) => setCompany({ ...company, terms: event.target.value })} /></div>
            <Button type="submit" className="md:col-span-2 w-fit">Save general settings</Button>
          </form>
        </TabsContent>
        <TabsContent value="uae">
          <form className="grid max-w-xl gap-3" onSubmit={async (event) => {
            event.preventDefault()
            await api("/api/settings/tax", { method: "PUT", body: JSON.stringify({ ...tax, vatRate: Number(tax.vatRate), vatEnabled: Boolean(tax.vatEnabled), trnRequired: Boolean(tax.trnRequired) }) })
            toast.success("Tax settings saved.")
          }}>
            <Label>Country</Label><Input value={company.country || "United Arab Emirates"} onChange={(event) => setCompany({ ...company, country: event.target.value })} />
            <Label>Currency</Label><Input value={String(tax.currency || "AED")} onChange={(event) => setTax({ ...tax, currency: event.target.value.toUpperCase() })} />
            <Label>VAT label</Label><Input value={String(tax.vatLabel || "VAT")} onChange={(event) => setTax({ ...tax, vatLabel: event.target.value })} />
            <Label>VAT rate %</Label><Input type="number" value={String(tax.vatRate ?? 5)} onChange={(event) => setTax({ ...tax, vatRate: event.target.value })} />
            <label className="flex items-center justify-between text-sm">VAT enabled <Switch checked={Boolean(tax.vatEnabled)} onCheckedChange={(checked) => setTax({ ...tax, vatEnabled: checked })} /></label>
            <label className="flex items-center justify-between text-sm">TRN required on registration <Switch checked={Boolean(tax.trnRequired)} onCheckedChange={(checked) => setTax({ ...tax, trnRequired: checked })} /></label>
            <Label>Corporate tax note</Label><Textarea value={String(tax.corporateTaxNote || "")} onChange={(event) => setTax({ ...tax, corporateTaxNote: event.target.value })} />
            <Button type="submit">Save UAE tax settings</Button>
          </form>
          <ReminderEditor system={system} />
        </TabsContent>
        <TabsContent value="vendor"><CatalogEditor /></TabsContent>
        <TabsContent value="workflow"><WorkflowEditor /></TabsContent>
        <TabsContent value="notifications"><TemplateEditor /></TabsContent>
        <TabsContent value="finance"><p className="text-sm text-muted-foreground">Payment terms are managed with vendor categories. Currency follows the UAE tax setting.</p><CatalogEditor termsOnly /></TabsContent>
        <TabsContent value="features">
          <RecordTable
            rows={features}
            empty="No features are configured."
            rowKey={(row) => row.key}
            columns={[
              { header: "Feature", className: "font-medium", cell: (row) => row.name },
              { header: "Key", cell: (row) => row.key },
              { header: "Group", cell: (row) => row.group },
              { header: "Description", cell: (row) => row.description || "—" },
              { header: "Status", cell: (row) => <Badge value={row.enabled ? "ACTIVE" : "SUSPENDED"} /> },
              { header: "", cell: (row) => (
                <Switch checked={row.enabled} onCheckedChange={async (enabled) => {
                  const previous = features
                  setFeatures(features.map((item) => item.key === row.key ? { ...item, enabled } : item))
                  try {
                    await api(`/api/features/${row.key}`, { method: "PATCH", body: JSON.stringify({ enabled }) })
                  } catch (error) {
                    setFeatures(previous)
                    toast.error(error instanceof Error ? error.message : "Could not update the feature.")
                  }
                }} />
              ) },
            ]}
          />
        </TabsContent>
        <TabsContent value="branding">
          <form className="grid max-w-xl gap-3" onSubmit={saveCompany}>
            <Label>Logo URL</Label><Input value={company.logoUrl || ""} onChange={(event) => setCompany({ ...company, logoUrl: event.target.value })} placeholder="/api/files/..." />
            <Label>Favicon URL</Label><Input value={company.faviconUrl || ""} onChange={(event) => setCompany({ ...company, faviconUrl: event.target.value })} />
            <Label>Primary colour</Label><Input value={company.primaryColor || "#111111"} onChange={(event) => setCompany({ ...company, primaryColor: event.target.value })} />
            <Label>Secondary colour</Label><Input value={company.secondaryColor || "#C4A574"} onChange={(event) => setCompany({ ...company, secondaryColor: event.target.value })} />
            <Label>Default theme</Label>
            <Select value={company.defaultTheme || "system"} onChange={(event) => setCompany({ ...company, defaultTheme: event.target.value })}>
              <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
            </Select>
            <Label>Homepage headline</Label><Input value={company.heroHeadline || ""} onChange={(event) => setCompany({ ...company, heroHeadline: event.target.value })} />
            <Label>Supporting line</Label><Textarea value={company.heroSubtext || ""} onChange={(event) => setCompany({ ...company, heroSubtext: event.target.value })} />
            <Button type="submit">Save branding</Button>
          </form>
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationForm />
        </TabsContent>
        <TabsContent value="email">
          <EmailDeliveryForm />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ReminderEditor({ system }: { system: { key: string; value: unknown }[] }) {
  const current = system.find((item) => item.key === "documents.reminderDays")
  const [value, setValue] = useState(Array.isArray(current?.value) ? current.value.join(", ") : "60, 30, 15, 7, 1")
  return (
    <form className="mt-6 max-w-xl space-y-2" onSubmit={async (event) => {
      event.preventDefault()
      const days = value.split(",").map((item) => Number(item.trim())).filter((item) => item > 0)
      await api("/api/settings/system", { method: "PUT", body: JSON.stringify({ key: "documents.reminderDays", value: days }) })
      toast.success("Reminder windows saved.")
    }}>
      <Label>Document reminder days</Label>
      <Input value={value} onChange={(event) => setValue(event.target.value)} />
      <Button type="submit">Save reminders</Button>
    </form>
  )
}

function CatalogEditor({ termsOnly = false }: { termsOnly?: boolean }) {
  const [name, setName] = useState("")
  const [rows, setRows] = useState<{ id: string; name: string }[]>([])
  const path = termsOnly ? "/api/payment-terms" : "/api/vendor-categories"
  useEffect(() => { api<{ id: string; name: string }[]>(path).then(setRows).catch(() => undefined) }, [path])
  return (
    <div className="space-y-3">
      <form className="flex gap-2" onSubmit={async (event) => {
        event.preventDefault()
        await api(path, { method: "POST", body: JSON.stringify(termsOnly ? { name, days: 30 } : { name }) })
        setRows(await api(path))
        setName("")
      }}>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={termsOnly ? "New payment term" : "New category"} />
        <Button type="submit">Add</Button>
      </form>
      <RecordTable rows={rows} empty="Nothing in this list yet." rowKey={(row) => row.id} columns={[{ header: "Name", className: "font-medium", cell: (row) => row.name }]} />
      {!termsOnly && <FieldBuilder />}
    </div>
  )
}

function FieldBuilder() {
  const [label, setLabel] = useState("")
  const [fieldType, setFieldType] = useState("TEXT")
  const [fields, setFields] = useState<{ id: string; label: string; fieldType: string; required: boolean }[]>([])
  useEffect(() => { api<typeof fields>("/api/custom-fields").then(setFields).catch(() => undefined) }, [])
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-medium">Registration fields</h2>
      <form className="grid gap-2 md:grid-cols-3" onSubmit={async (event) => {
        event.preventDefault()
        await api("/api/custom-fields", { method: "POST", body: JSON.stringify({ label, fieldType, section: "company" }) })
        setFields(await api("/api/custom-fields"))
        setLabel("")
      }}>
        <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Field label" required />
        <Select value={fieldType} onChange={(event) => setFieldType(event.target.value)}>{FIELD_TYPES.map((type) => <option key={type}>{type}</option>)}</Select>
        <Button type="submit">Add field</Button>
      </form>
      <RecordTable
        rows={fields}
        empty="No custom fields yet."
        rowKey={(row) => row.id}
        columns={[
          { header: "Label", className: "font-medium", cell: (row) => row.label },
          { header: "Type", cell: (row) => row.fieldType },
          { header: "Required", cell: (row) => row.required ? "Yes" : "No" },
        ]}
      />
    </Card>
  )
}

function WorkflowEditor() {
  const [rows, setRows] = useState<{ id: string; name: string; steps: { name: string }[] }[]>([])
  const [name, setName] = useState("Vendor registration")
  const [steps, setSteps] = useState("Compliance, Finance, Management, Final Approval")
  useEffect(() => { api<typeof rows>("/api/workflows").then(setRows).catch(() => undefined) }, [])
  return (
    <div className="space-y-3">
      <RecordTable
        rows={rows}
        empty="No workflows yet."
        rowKey={(row) => row.id}
        columns={[
          { header: "Workflow", className: "font-medium", cell: (row) => row.name },
          { header: "Steps", cell: (row) => row.steps.map((step) => step.name).join(" → ") || "—" },
          { header: "Levels", cell: (row) => row.steps.length },
        ]}
      />
      <form className="grid gap-2" onSubmit={async (event) => {
        event.preventDefault()
        await api("/api/workflows", { method: "POST", body: JSON.stringify({ name, module: "vendor_registration", steps: steps.split(",").map((step) => ({ name: step.trim() })).filter((step) => step.name) }) })
        setRows(await api("/api/workflows"))
        toast.success("Workflow saved.")
      }}>
        <Input value={name} onChange={(event) => setName(event.target.value)} />
        <Input value={steps} onChange={(event) => setSteps(event.target.value)} />
        <Button type="submit" className="w-fit">Save workflow</Button>
      </form>
    </div>
  )
}

function TemplateEditor() {
  const [rows, setRows] = useState<{ id: string; name: string; subject: string; body: string }[]>([])
  useEffect(() => { api<typeof rows>("/api/notification-templates").then(setRows).catch(() => undefined) }, [])
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.id} className="space-y-2 p-4">
          <div className="font-medium">{row.name}</div>
          <Input defaultValue={row.subject} id={`${row.id}-subject`} />
          <Textarea defaultValue={row.body} id={`${row.id}-body`} />
          <Button variant="outline" onClick={async () => {
            const subject = (document.getElementById(`${row.id}-subject`) as HTMLInputElement).value
            const body = (document.getElementById(`${row.id}-body`) as HTMLTextAreaElement).value
            await api(`/api/notification-templates/${row.id}`, { method: "PATCH", body: JSON.stringify({ name: row.name, subject, body }) })
            toast.success("Template saved.")
          }}>Save template</Button>
        </Card>
      ))}
    </div>
  )
}

function EmailDeliveryForm() {
  const [form, setForm] = useState<Record<string, string | number | boolean>>({
    provider: "smtp",
    senderName: "",
    senderEmail: "",
    replyTo: "",
    publicBaseUrl: "",
    dailyLimit: 10000,
    perSecond: 5,
    perMinute: 120,
    perHour: 2000,
    batchSize: 25,
    maxRetries: 3,
    initialDelayMs: 30000,
    maxDelayMs: 3600000,
    trackingEnabled: true,
    openTracking: true,
    clickTracking: true,
    bounceProcessing: true,
    complaintProcessing: true,
    unsubscribeEnabled: true,
  })
  const [apiKey, setApiKey] = useState("")
  const [redisUrl, setRedisUrl] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [mailgunDomain, setMailgunDomain] = useState("")
  const [flags, setFlags] = useState({ smtpConfigured: false, providerSecretSet: false, redisConfigured: false, webhookSecretSet: false })
  useEffect(() => {
    api<typeof form & typeof flags>("/api/email/settings").then((data) => {
      setForm((current) => ({ ...current, ...data }))
      setFlags({ smtpConfigured: Boolean(data.smtpConfigured), providerSecretSet: Boolean(data.providerSecretSet), redisConfigured: Boolean(data.redisConfigured), webhookSecretSet: Boolean(data.webhookSecretSet) })
    }).catch((error) => toast.error(error.message))
  }, [])
  const toggle = (key: string) => (
    <label className="flex items-center justify-between text-sm">
      {key}
      <Switch checked={Boolean(form[key])} onCheckedChange={(checked) => setForm({ ...form, [key]: checked })} />
    </label>
  )
  return (
    <form className="grid max-w-3xl gap-3 md:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault()
      const numbers = ["dailyLimit", "perSecond", "perMinute", "perHour", "batchSize", "maxRetries", "initialDelayMs", "maxDelayMs"]
      const body: Record<string, unknown> = { ...form }
      delete body.smtpConfigured
      delete body.providerSecretSet
      delete body.redisConfigured
      delete body.webhookSecretSet
      for (const key of numbers) body[key] = Number(form[key])
      if (apiKey) body.apiKey = apiKey
      if (redisUrl) body.redisUrl = redisUrl
      if (webhookSecret) body.webhookSecret = webhookSecret
      if (mailgunDomain) body.mailgunDomain = mailgunDomain
      try {
        await api("/api/email/settings", { method: "PUT", body: JSON.stringify(body) })
        toast.success("Email settings saved. Secrets stay encrypted and are not shown again.")
        setApiKey("")
        setRedisUrl("")
        setWebhookSecret("")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save email settings.")
      }
    }}>
      <p className="text-sm text-muted-foreground md:col-span-2">Provider credentials, Redis, and the webhook secret are encrypted in the database. Leave a secret blank to keep the saved value. SMTP host and password stay on the Integrations tab.</p>
      <div><Label>Provider</Label>
        <Select className="mt-1" value={String(form.provider)} onChange={(event) => setForm({ ...form, provider: event.target.value })}>
          {["smtp", "ses", "sendgrid", "mailgun", "postmark", "resend"].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </div>
      <div><Label>Sender name</Label><Input className="mt-1" value={String(form.senderName || "")} onChange={(event) => setForm({ ...form, senderName: event.target.value })} /></div>
      <div><Label>Sender email</Label><Input className="mt-1" value={String(form.senderEmail || "")} onChange={(event) => setForm({ ...form, senderEmail: event.target.value })} /></div>
      <div><Label>Reply-to</Label><Input className="mt-1" value={String(form.replyTo || "")} onChange={(event) => setForm({ ...form, replyTo: event.target.value })} /></div>
      <div className="md:col-span-2"><Label>Public base URL for tracking links</Label><Input className="mt-1" value={String(form.publicBaseUrl || "")} onChange={(event) => setForm({ ...form, publicBaseUrl: event.target.value })} placeholder="https://your-domain.com" /></div>
      {["dailyLimit", "perSecond", "perMinute", "perHour", "batchSize", "maxRetries", "initialDelayMs", "maxDelayMs"].map((key) => (
        <div key={key}><Label>{key}</Label><Input className="mt-1" type="number" value={String(form[key] ?? "")} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></div>
      ))}
      <div className="space-y-2 md:col-span-2">
        {["trackingEnabled", "openTracking", "clickTracking", "bounceProcessing", "complaintProcessing", "unsubscribeEnabled"].map((key) => <div key={key}>{toggle(key)}</div>)}
      </div>
      <div><Label>API key {flags.providerSecretSet ? "(saved)" : ""}</Label><Input className="mt-1" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Leave blank to keep the saved key" /></div>
      <div><Label>Mailgun domain</Label><Input className="mt-1" value={mailgunDomain} onChange={(event) => setMailgunDomain(event.target.value)} /></div>
      <div><Label>Redis URL {flags.redisConfigured ? "(saved)" : ""}</Label><Input className="mt-1" type="password" value={redisUrl} onChange={(event) => setRedisUrl(event.target.value)} placeholder="redis://localhost:6379" /></div>
      <div><Label>Webhook secret {flags.webhookSecretSet ? "(saved)" : ""}</Label><Input className="mt-1" type="password" value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} placeholder="At least 16 characters" /></div>
      <p className="text-sm text-muted-foreground md:col-span-2">SMTP {flags.smtpConfigured ? "is configured" : "is not configured yet"}. Open tracking records a pixel request. It is not proof that someone read the message.</p>
      <Button type="submit" className="w-fit">Save email settings</Button>
    </form>
  )
}

function IntegrationForm() {
  const [host, setHost] = useState("")
  const [port, setPort] = useState("587")
  const [user, setUser] = useState("")
  const [from, setFrom] = useState("")
  const [secret, setSecret] = useState("")
  return (
    <form className="grid max-w-xl gap-3" onSubmit={async (event) => {
      event.preventDefault()
      await api("/api/settings/integrations", { method: "POST", body: JSON.stringify({ provider: "smtp", enabled: true, config: { host, port: Number(port), user, from, secure: port === "465" }, secret: secret || undefined }) })
      toast.success("Mail settings saved. The password is encrypted in the database.")
      setSecret("")
    }}>
      <p className="text-sm text-muted-foreground">Vendor invitations and field notes are emailed through this SMTP connection. Until it is saved, an administrator still sees the temporary password after creating a vendor.</p>
      <Label>SMTP host</Label>
      <Input value={host} onChange={(event) => setHost(event.target.value)} placeholder="smtp.example.com" required />
      <Label>Port</Label>
      <Input value={port} onChange={(event) => setPort(event.target.value)} />
      <Label>Username</Label>
      <Input value={user} onChange={(event) => setUser(event.target.value)} />
      <Label>From address</Label>
      <Input value={from} onChange={(event) => setFrom(event.target.value)} placeholder="vendors@example.com" required />
      <Label>Password</Label>
      <Input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} required />
      <Button type="submit">Save mail settings</Button>
    </form>
  )
}
