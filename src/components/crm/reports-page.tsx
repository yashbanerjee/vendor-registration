"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label, Select } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/api-client"
import { formatDate, formatMoney } from "@/lib/format"

const types = ["vendors", "registrations", "approvals", "compliance", "expiry", "events", "rfqs", "quotations", "purchaseOrders", "contracts", "invoices", "payments", "performance", "spend"]

export function ReportsPage({ currency }: { currency: string }) {
  const [type, setType] = useState("vendors")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState("")

  async function run() {
    setError("")
    try {
      const data = await api<Record<string, unknown>[]>(`/api/reports?type=${type}&from=${from}&to=${to}`)
      setRows(data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Report failed.")
    }
  }

  const columns = rows[0] ? Object.keys(rows[0]).slice(0, 6) : []
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <Card className="grid gap-3 p-4 md:grid-cols-4">
        <div><Label>Report</Label><Select className="mt-1" value={type} onChange={(event) => setType(event.target.value)}>{types.map((item) => <option key={item}>{item}</option>)}</Select></div>
        <div><Label>From</Label><Input className="mt-1" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
        <div><Label>To</Label><Input className="mt-1" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
        <div className="flex items-end gap-2">
          <Button onClick={run}>Run</Button>
          <Button variant="outline" asChild><a href={`/api/reports?type=${type}&from=${from}&to=${to}&format=csv`}>CSV</a></Button>
          <Button variant="outline" asChild><a href={`/api/reports?type=${type}&from=${from}&to=${to}&format=xlsx`}>Excel</a></Button>
        </div>
      </Card>
      {error && <Card className="p-4 text-sm">{error}</Card>}
      <Card className="overflow-auto">
        <Table>
          <TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {rows.slice(0, 100).map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => <TableCell key={column}>{formatCell(row[column], currency)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && <p className="p-6 text-sm text-muted-foreground">Run a report to see rows. PDF export uses your browser print dialog from this table.</p>}
      </Card>
      <Button variant="outline" onClick={() => window.print()}>Print / PDF</Button>
    </div>
  )
}

function formatCell(value: unknown, currency: string) {
  if (value && typeof value === "object") return JSON.stringify(value)
  if (typeof value === "string" && value.includes("T") && !Number.isNaN(Date.parse(value))) return formatDate(value)
  if (typeof value === "number" && value > 999) return formatMoney(value, currency)
  return value == null ? "—" : String(value)
}
