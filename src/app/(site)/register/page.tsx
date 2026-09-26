import Link from "next/link"

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="font-display text-4xl">Vendor registration is by invitation</h1>
      <p className="mt-4 text-muted-foreground">An administrator creates your company with your email address. You will receive a sign-in link and a temporary password. After you choose your own password, you can submit the details the team requires.</p>
      <Link href="/login" className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground">Vendor sign in</Link>
    </main>
  )
}
