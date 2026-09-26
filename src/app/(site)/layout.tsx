import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome"

export const dynamic = "force-dynamic"

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  )
}
