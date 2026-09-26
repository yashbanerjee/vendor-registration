"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label, Select } from "@/components/ui/input"
import { api } from "@/lib/api-client"

type Role = { id: string; name: string; slug: string; description?: string | null; portal: string; isSystem: boolean; permissions: { module: string; actions: string[] }[] }

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [name, setName] = useState("")
  const [portal, setPortal] = useState("ADMIN")
  const [selected, setSelected] = useState<Record<string, string[]>>({})

  useEffect(() => { api<Role[]>("/api/roles").then(setRoles).catch((error) => toast.error(error.message)) }, [])

  function toggle(module: string, action: string) {
    const current = selected[module] || []
    setSelected({ ...selected, [module]: current.includes(action) ? current.filter((item) => item !== action) : [...current, action] })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Roles</h1>
      <div className="grid gap-3 lg:grid-cols-2">
        {roles.map((role) => (
          <Card key={role.id} className="p-4 text-sm">
            <div className="font-medium">{role.name}</div>
            <p className="text-muted-foreground">{role.description} · {role.portal}</p>
            <p className="mt-2">{role.permissions.map((permission) => `${permission.module}: ${permission.actions.join(", ")}`).slice(0, 3).join(" · ")}</p>
          </Card>
        ))}
      </div>
      <Card className="space-y-3 p-4">
        <h2 className="font-medium">New role</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Name</Label><Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div><Label>Portal</Label><Select className="mt-1" value={portal} onChange={(event) => setPortal(event.target.value)}><option>ADMIN</option><option>VENDOR</option><option>SUPER_ADMIN</option></Select></div>
        </div>
        <div className="max-h-72 overflow-auto text-xs">
          {PERMISSION_MODULES.map((module) => (
            <div key={module} className="flex flex-wrap gap-2 border-b border-border py-2">
              <span className="w-28 font-medium">{module}</span>
              {PERMISSION_ACTIONS.map((action) => (
                <label key={action} className="flex items-center gap-1"><input type="checkbox" checked={selected[module]?.includes(action) || false} onChange={() => toggle(module, action)} />{action}</label>
              ))}
            </div>
          ))}
        </div>
        <Button onClick={async () => {
          await api("/api/roles", { method: "POST", body: JSON.stringify({ name, portal, permissions: Object.entries(selected).map(([module, actions]) => ({ module, actions })) }) })
          setRoles(await api("/api/roles"))
          toast.success("Role created.")
        }}>Create role</Button>
      </Card>
    </div>
  )
}
