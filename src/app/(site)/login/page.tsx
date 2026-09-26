import { Suspense } from "react"
import { SignInForm } from "@/components/auth/sign-in-form"
export default function LoginPage() {
  return <main className="px-4 pb-16"><Suspense><SignInForm portal="vendor" /></Suspense></main>
}
