"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/input"
import { api } from "@/lib/api-client"

export function SignInForm({ portal }: { portal: "admin" | "vendor" }) {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  return (
    <div className="mx-auto mt-16 w-full max-w-[400px]">
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-[3px] bg-primary text-sm font-semibold text-primary-foreground">V</div>
        <div>
          <div className="text-sm font-semibold">Vendor management</div>
          <div className="text-xs text-muted-foreground">{portal === "admin" ? "Staff workspace" : "Vendor portal"}</div>
        </div>
      </div>
      <form
        className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-[var(--shadow-raised)]"
        onSubmit={async (event) => {
          event.preventDefault()
          try {
            const user = await api<{ portal: string; mustChangePassword?: boolean }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password, portal }) })
            if (user.mustChangePassword) {
              router.push("/vendor/password")
              router.refresh()
              return
            }
            const next = params.get("next")
            router.push(next || (user.portal === "VENDOR" ? "/vendor" : "/admin"))
            router.refresh()
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Sign-in failed.")
          }
        }}
      >
        <div>
          <h1 className="text-xl font-medium">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use the email and password issued for this workspace.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
        </div>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>
    </div>
  )
}
