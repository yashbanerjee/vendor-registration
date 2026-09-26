import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { prisma } from "@/server/db"
import "./globals.css"

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" })

export async function generateMetadata(): Promise<Metadata> {
  const company = await loadCompany()
  const title = company?.companyName || "Vendor Management"
  const description = company?.heroSubtext || "Manage vendor onboarding, compliance, procurement, and event delivery."
  return {
    title: { default: title, template: `%s · ${title}` },
    description,
    metadataBase: safeBase(company?.website),
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
    icons: company?.faviconUrl ? { icon: company.faviconUrl } : undefined,
  }
}

async function loadCompany() {
  try {
    return await prisma.companySetting.findUnique({ where: { id: "default" } })
  } catch {
    return null
  }
}

function safeBase(website?: string | null) {
  if (!website) return undefined
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`)
  } catch {
    return undefined
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} min-h-screen antialiased`}>
        <ThemeProvider>
          {children}
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
