import Link from "next/link"
import { prisma } from "@/server/db"
import { duringRequest } from "@/server/live"

export async function SiteHeader() {
  const company = await safeCompany()
  const name = company?.companyName || "Vendor desk"
  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="font-display text-lg">{name}</Link>
        <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
          <Link href="/features">Features</Link>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/about">About</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm">Vendor sign in</Link>
          <Link href="/admin/login" className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">Staff sign in</Link>
        </div>
      </div>
    </header>
  )
}

export async function SiteFooter() {
  const company = await safeCompany()
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
        <div>
          <div className="font-display text-xl">{company?.companyName || "Vendor desk"}</div>
          <p className="mt-2 text-sm text-muted-foreground">{company?.address || "Dubai, United Arab Emirates"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{company?.email || "info@vedha.ae"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{company?.phone || "+971 50 658 3342"}</p>
        </div>
        <div className="space-y-2 text-sm"><div className="font-medium">Platform</div><Link href="/features">Features</Link><br /><Link href="/how-it-works">How it works</Link><br /><Link href="/login">Vendor sign in</Link></div>
        <div className="space-y-2 text-sm"><div className="font-medium">Company</div><Link href="/about">About</Link><br /><Link href="/contact">Contact</Link><br /><Link href="/faq">FAQ</Link></div>
        <div className="space-y-2 text-sm"><div className="font-medium">Policies</div><Link href="/privacy">Privacy</Link><br /><Link href="/terms">Terms</Link></div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} {company?.legalName || company?.companyName || "Vedha Technologies LLC-FZ"}, Dubai</div>
    </footer>
  )
}

export async function safeCompany() {
  await duringRequest()
  try {
    return await prisma.companySetting.findUnique({ where: { id: "default" } })
  } catch {
    return null
  }
}
