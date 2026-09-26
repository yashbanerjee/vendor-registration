import { Suspense } from "react"
import { SignInForm } from "@/components/auth/sign-in-form"
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome"

export default function AdminLoginPage() {
  return (
    <div>
      <SiteHeader />
      <main className="px-4 pb-16"><Suspense><SignInForm portal="admin" /></Suspense></main>
      <SiteFooter />
    </div>
  )
}
