import { Suspense } from "react"
import { SignInForm } from "@/components/auth/sign-in-form"
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome"

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-4"><Suspense><SignInForm portal="admin" /></Suspense></main>
      <SiteFooter />
    </div>
  )
}
