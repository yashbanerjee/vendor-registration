"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label } from "@/components/ui/input"
import { api } from "@/lib/api-client"

export default function VendorPasswordPage() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState("")
  const [password, setPassword] = useState("")

  return (
    <Card className="mx-auto max-w-md space-y-4 p-6">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">First sign-in</p>
        <h1 className="mt-1 text-xl font-medium">Choose your password</h1>
        <p className="mt-2 text-sm text-muted-foreground">Use the temporary password from your invitation email, then set a password only you know.</p>
      </div>
      <form className="space-y-3" onSubmit={async (event) => {
        event.preventDefault()
        try {
          await api("/api/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, password }) })
          toast.success("Password updated. Complete your company details next.")
          router.push("/vendor/profile")
          router.refresh()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not update the password.")
        }
      }}>
        <div><Label>Temporary password</Label><Input className="mt-1" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></div>
        <div><Label>New password</Label><Input className="mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
        <Button type="submit" className="w-full">Save password</Button>
      </form>
    </Card>
  )
}
