import Link from "next/link"

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-3xl font-medium">Vendor registration is by invitation</h1>
      <p className="mt-4 text-muted-foreground">An administrator creates your company with your email address. You will receive a sign-in link and a temporary password. After you choose your own password, you can submit the details the team requires.</p>
      <Link href="/login" className="mt-6 inline-flex h-8 items-center rounded-[3px] bg-primary px-3 text-sm font-medium text-primary-foreground">Vendor sign in</Link>
    </main>
  )
}
