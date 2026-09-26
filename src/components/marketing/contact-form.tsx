"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input, Label, Textarea } from "@/components/ui/input"

export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", company: "", phone: "", message: "" })
  return (
    <form className="mt-8 grid gap-3" onSubmit={async (event) => {
      event.preventDefault()
      const response = await fetch("/api/public/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      const payload = await response.json()
      if (!payload.success) return toast.error(payload.message)
      toast.success(payload.message)
      setForm({ name: "", email: "", company: "", phone: "", message: "" })
    }}>
      <Field label="Name"><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="Email"><Input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
      <Field label="Company"><Input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></Field>
      <Field label="Phone"><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
      <Field label="Message"><Textarea required value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></Field>
      <Button type="submit" className="w-fit">Send message</Button>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label><div className="mt-1">{children}</div></div>
}
