"use client"

import { useEffect, useState } from "react"
import { RecordTable } from "@/components/crm/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { api } from "@/lib/api-client"
import { formatDate } from "@/lib/format"

export function NotificationList() {
  const [rows, setRows] = useState<{ id: string; title: string; body: string; createdAt: string; readAt?: string | null; type?: string }[]>([])
  const [error, setError] = useState("")

  function load() {
    api<{ rows: typeof rows }>("/api/notifications").then((data) => setRows(data.rows || [])).catch((reason) => setError(reason.message))
  }
  useEffect(load, [])

  if (error) return <Card className="p-6">{error}</Card>
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <Button variant="outline" onClick={async () => { await api("/api/notifications/read", { method: "POST", body: JSON.stringify({}) }); load() }}>Mark all read</Button>
      </div>
      <RecordTable
        rows={rows}
        empty="No notifications yet."
        rowKey={(row) => row.id}
        columns={[
          { header: "Title", className: "font-medium", cell: (row) => row.title },
          { header: "Message", cell: (row) => row.body },
          { header: "Type", cell: (row) => row.type || "general" },
          { header: "Status", cell: (row) => <Badge value={row.readAt ? "READ" : "PENDING"} /> },
          { header: "Received", cell: (row) => formatDate(row.createdAt, true) },
        ]}
      />
    </div>
  )
}
