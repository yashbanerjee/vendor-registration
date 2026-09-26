"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label } from "@/components/ui/input"
import { api } from "@/lib/api-client"

export default function SetupPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [form, setForm] = useState({ companyName: "", name: "", email: "", password: "" })

  useEffect(() => {
    api<{ needsSetup: boolean }>("/api/auth/setup").then((data) => {
      setBlocked(!data.needsSetup)
      setReady(true)
    }).catch(() => setReady(true))
  }, [])

  if (!ready) return <main className="p-10">Checking installation…</main>
  if (blocked) return <main className="mx-auto max-w-lg p-10"><h1 className="text-2xl font-semibold">Setup is already complete</h1><p className="mt-2 text-sm text-muted-foreground">Sign in with the super admin account.</p></main>

  return (
    <main className="px-4 py-16">
      <Card className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Create the super admin</h1>
        <p className="text-sm text-muted-foreground">This page is available only while the database has no users. The password is not stored in the environment file.</p>
        <form className="space-y-3" onSubmit={async (event) => {
          event.preventDefault()
          try {
            await api("/api/auth/setup", { method: "POST", body: JSON.stringify(form) })
            router.push("/admin")
            router.refresh()
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Setup failed.")
          }
        }}>
          <div><Label>Company name</Label><Input className="mt-1" value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} required /></div>
          <div><Label>Your name</Label><Input className="mt-1" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div>
          <div><Label>Email</Label><Input className="mt-1" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></div>
          <div><Label>Password</Label><Input className="mt-1" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></div>
          <Button type="submit">Create account</Button>
        </form>
      </Card>
    </main>
  )
}
