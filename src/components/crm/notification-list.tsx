"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { api } from "@/lib/api-client"
import { formatDate } from "@/lib/format"

export function NotificationList() {
  const [rows, setRows] = useState<{ id: string; title: string; body: string; createdAt: string; readAt?: string | null }[]>([])
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
      {rows.length === 0 ? <Card className="p-8 text-sm text-muted-foreground">No notifications yet.</Card> : rows.map((row) => (
        <Card key={row.id} className="p-4">
          <div className="flex items-center justify-between"><strong>{row.title}</strong><span className="text-xs text-muted-foreground">{formatDate(row.createdAt, true)}</span></div>
          <p className="mt-1 text-sm text-muted-foreground">{row.body}</p>
        </Card>
      ))}
    </div>
  )
}
