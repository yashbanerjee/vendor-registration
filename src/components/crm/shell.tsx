"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import {
  Bell,
  Building2,
  CalendarRange,
  ChartColumn,
  ClipboardCheck,
  FileSignature,
  FileSpreadsheet,
  Files,
  HardHat,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  QrCode,
  Receipt,
  Scale,
  ScrollText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Star,
  Sun,
  ToggleRight,
  Truck,
  Users,
  Wallet,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { adminNav, vendorNav, type NavItem } from "@/config/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { api } from "@/lib/api-client"
import { can } from "@/lib/permissions"
import type { FeatureFlag, PublicUser } from "@/lib/types"
import { cn } from "@/lib/utils"

const iconMap = {
  LayoutDashboard, Building2, ClipboardCheck, Files, ShieldCheck, CalendarRange, Send, Scale, FileSpreadsheet, FileSignature, ListChecks, Truck, HardHat, QrCode, Receipt, Wallet, Star, LifeBuoy, ChartColumn, Bell, Users, KeyRound, ScrollText, ToggleRight, Settings,
}

export function Shell({
  portal,
  user,
  features,
  companyName,
  primaryColor,
  children,
}: {
  portal: "admin" | "vendor"
  user: PublicUser
  features: FeatureFlag[]
  companyName: string
  primaryColor?: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Record<string, { id: string; label: string; href: string }[]>>({})
  const [notes, setNotes] = useState<{ id: string; title: string; body: string; readAt?: string | null; link?: string | null }[]>([])
  const [unread, setUnread] = useState(0)

  const enabled = useMemo(() => new Set(features.filter((feature) => feature.enabled).map((feature) => feature.key)), [features])
  const approved = user.vendor?.status === "APPROVED" || user.vendor?.status === "ACTIVE"
  const onboarding = user.vendor?.status === "DRAFT" || user.vendor?.status === "CHANGES_REQUESTED"
  const items = (portal === "admin" ? adminNav : vendorNav).filter((item) => {
    if (item.feature && !enabled.has(item.feature)) return false
    if (item.superOnly && user.portal !== "SUPER_ADMIN") return false
    if (item.module && !can(user, item.module, "VIEW")) return false
    if (portal === "vendor" && !approved) {
      const allowed = new Set(["/vendor", "/vendor/notifications"])
      if (onboarding) {
        allowed.add("/vendor/profile")
        allowed.add("/vendor/documents")
      }
      if (!allowed.has(item.href)) return false
    }
    return true
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!enabled.has("notifications")) return
    api<{ rows: typeof notes; unread: number }>("/api/notifications")
      .then((data) => {
        setNotes(data.rows || [])
        setUnread(data.unread || 0)
      })
      .catch(() => undefined)
  }, [enabled])

  useEffect(() => {
    if (!searchOpen || query.trim().length < 2) return
    const timer = setTimeout(() => {
      api<Record<string, { id: string; legalName?: string; name?: string; number?: string; title?: string; code?: string; vendorCode?: string; status?: string }[]>>(`/api/search?q=${encodeURIComponent(query)}`)
        .then((data) => {
          const next: Record<string, { id: string; label: string; href: string }[]> = {}
          const base = portal === "admin" ? "/admin" : "/vendor"
          for (const [key, rows] of Object.entries(data)) {
            next[key] = (rows || []).map((row) => ({
              id: row.id,
              label: row.legalName || row.title || row.name || row.number || row.code || "Record",
              href: key === "vendors" && portal === "admin" ? `/admin/vendors/${row.id}` : `${base}/${key === "purchaseOrders" ? "purchase-orders" : key}`,
            }))
          }
          setResults(next)
        })
        .catch(() => undefined)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, searchOpen, portal])

  async function logout() {
    await api("/api/auth/logout", { method: "POST" })
    router.push(portal === "vendor" ? "/login" : "/admin/login")
    router.refresh()
  }

  const sections = [...new Set(items.map((item) => item.section))]

  const nav = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-3 px-4 py-5", collapsed && "lg:px-3")}>
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brass/20 text-sm font-semibold text-brass">{companyName.slice(0, 1)}</div>
        <div className={cn("min-w-0", collapsed && "lg:hidden")}>
          <div className="truncate text-sm font-semibold">{companyName}</div>
          <div className="text-xs text-sidebar-muted">{portal === "admin" ? "Operations" : "Vendor portal"}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section}>
            <div className={cn("px-2 pb-1 text-[11px] uppercase tracking-[0.14em] text-sidebar-muted", collapsed && "lg:hidden")}>{section}</div>
            <div className="space-y-0.5">
              {items.filter((item) => item.section === section).map((item) => {
                const Icon = iconMap[item.icon as keyof typeof iconMap] || LayoutDashboard
                const active = pathname === item.href || (item.href !== `/${portal}` && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      active && "bg-sidebar-accent text-sidebar-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  )

  return (
    <div className="min-h-screen bg-background" style={primaryColor ? ({ ["--brand-primary" as string]: primaryColor } as React.CSSProperties) : undefined}>
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block", collapsed ? "w-[4.5rem]" : "w-64")}>{nav()}</aside>
      <div className={cn("min-h-screen", collapsed ? "lg:pl-[4.5rem]" : "lg:pl-64")}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="hidden lg:inline-flex" onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? "Expand" : "Collapse"}
          </Button>
          <button className="hidden h-10 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 text-left text-sm text-muted-foreground md:flex" onClick={() => setSearchOpen(true)}>
            <Search className="h-4 w-4" />
            Search vendors, events, orders
            <span className="ml-auto text-xs">Ctrl K</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)} className="md:hidden" aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
                  <Bell className="h-4 w-4" />
                  {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brass" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notes.slice(0, 6).map((note) => (
                  <DropdownMenuItem key={note.id} onClick={() => note.link && router.push(note.link)}>
                    <div>
                      <div className="font-medium">{note.title}</div>
                      <div className="text-xs text-muted-foreground">{note.body}</div>
                    </div>
                  </DropdownMenuItem>
                ))}
                {notes.length === 0 && <div className="px-2 py-3 text-sm text-muted-foreground">You are up to date.</div>}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              <Sun className="h-4 w-4 dark:hidden" />
              <Moon className="hidden h-4 w-4 dark:block" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="max-w-48">
                  <span className="truncate">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  {user.email}
                  <div className="mt-1"><Badge value={user.portal} /></div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout().catch((error) => toast.error(error.message))}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="px-4 py-6 md:px-6">{children}</main>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="p-0">{nav(() => setOpen(false))}</SheetContent>
      </Sheet>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-xl p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Search</DialogTitle>
          </DialogHeader>
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search the workspace" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>No matching records.</CommandEmpty>
              {Object.entries(results).map(([group, rows]) =>
                rows.length ? (
                  <CommandGroup key={group} heading={group}>
                    {rows.map((row) => (
                      <CommandItem key={row.id} value={row.id} onSelect={() => { setSearchOpen(false); router.push(row.href) }}>
                        {row.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null,
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function crumbs(pathname: string, items: NavItem[]) {
  const match = [...items].reverse().find((item) => pathname === item.href || (item.href !== "/admin" && item.href !== "/vendor" && pathname.startsWith(item.href)))
  return match?.label || "Dashboard"
}
