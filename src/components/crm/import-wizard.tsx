"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { api } from "@/lib/api-client"

type Preview = {
  summary: { total: number; successful: number; failed: number; duplicate: number; invalid: number }
  rows: { line: number; values: Record<string, string>; errors: string[]; status: string }[]
}

const steps = ["Upload", "Parse", "Validate", "Preview", "Errors", "Confirm", "Create"]

export function ImportWizard() {
  const [step, setStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<{ job: { successful: number; failed: number }; invitations?: { email: string; temporaryPassword?: string; emailed: boolean }[] } | null>(null)
  const [activate, setActivate] = useState(false)

  async function parse() {
    if (!file) return
    const body = new FormData()
    body.set("file", file)
    const response = await fetch("/api/vendors/import/preview", { method: "POST", body })
    const payload = await response.json()
    if (!payload.success) throw new Error(payload.message)
    setPreview(payload.data)
    setStep(3)
  }

  function exportErrors() {
    const failed = preview?.rows.filter((row) => row.status !== "valid") || []
    const lines = ["line,status,errors", ...failed.map((row) => `${row.line},${row.status},"${row.errors.join("; ").replace(/"/g, "'")}"`)]
    const blob = new Blob([lines.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "import-errors.csv"
    link.click()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Bulk import</h1>
        <p className="text-sm text-muted-foreground">Upload a CSV or Excel file. The template uses the columns your team can fill without changing the application.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {steps.map((label, index) => <span key={label} className={index <= step ? "rounded-full bg-primary px-2 py-1 text-primary-foreground" : "rounded-full bg-muted px-2 py-1"}>{index + 1}. {label}</span>)}
      </div>
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" type="button" onClick={() => { window.location.href = "/api/vendors/import/template" }}>Download Excel template</Button>
          <Button variant="outline" type="button" onClick={() => { window.location.href = "/api/vendors/import/template?format=csv" }}>Download CSV template</Button>
        </div>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => { setFile(event.target.files?.[0] || null); setStep(1) }} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={activate} onChange={(event) => setActivate(event.target.checked)} /> Import as active vendors</label>
        <div className="flex gap-2">
          <Button disabled={!file} onClick={() => parse().catch((error) => toast.error(error.message))}>Validate file</Button>
          {preview && <Button variant="outline" onClick={exportErrors}>Export errors</Button>}
        </div>
        {preview && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5 text-sm">
              {Object.entries(preview.summary).map(([key, value]) => <Card key={key} className="p-3"><div className="text-muted-foreground capitalize">{key}</div><div className="text-xl font-semibold">{value}</div></Card>)}
            </div>
            <div className="max-h-80 overflow-auto text-sm">
              {preview.rows.slice(0, 50).map((row) => (
                <div key={row.line} className="border-b border-border py-2">
                  <span className="font-medium">Row {row.line}</span> · {row.values.companyName || "Unnamed"} · {row.status}
                  {row.errors.length > 0 && <div className="text-destructive">{row.errors.join(" ")}</div>}
                </div>
              ))}
            </div>
            <Button onClick={async () => {
              setStep(6)
              const response = await api<{ job: { successful: number; failed: number }; invitations?: { email: string; temporaryPassword?: string; emailed: boolean }[] }>("/api/vendors/import/commit", {
                method: "POST",
                body: JSON.stringify({ fileName: file?.name, activate, rows: preview.rows.filter((row) => row.status === "valid").map((row) => row.values) }),
              })
              setResult(response)
              toast.success("Import finished.")
            }}>Confirm import</Button>
          </>
        )}
        {result && (
          <div className="space-y-2 text-sm">
            <p>Created {result.job.successful}. Failed {result.job.failed}. Vendors stay in draft until they submit their details.</p>
            {(result.invitations || []).filter((item) => item.temporaryPassword).map((item) => (
              <p key={item.email}>Mail is not configured for {item.email}. Temporary password: {item.temporaryPassword}</p>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
