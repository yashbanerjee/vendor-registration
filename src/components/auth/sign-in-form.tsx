"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label } from "@/components/ui/input"
import { api } from "@/lib/api-client"

export function SignInForm({ portal }: { portal: "admin" | "vendor" }) {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  return (
    <Card className="mx-auto mt-16 max-w-md space-y-4 p-6">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-brass">{portal === "admin" ? "Staff" : "Vendor"}</p>
        <h1 className="mt-2 text-2xl font-semibold">{portal === "admin" ? "Staff sign in" : "Vendor sign in"}</h1>
      </div>
      <form className="space-y-3" onSubmit={async (event) => {
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
      }}>
        <div><Label>Email</Label><Input className="mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
        <div><Label>Password</Label><Input className="mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>
    </Card>
  )
}
