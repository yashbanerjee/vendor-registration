export type NavItem = {
  href: string
  label: string
  icon: string
  feature?: string
  module?: string
  superOnly?: boolean
  section: string
}

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "LayoutDashboard", section: "Overview" },
  { href: "/admin/vendors", label: "Vendors", icon: "Building2", feature: "vendorRegistration", module: "vendors", section: "Network" },
  { href: "/admin/applications", label: "Applications", icon: "ClipboardCheck", feature: "vendorVerification", module: "vendors", section: "Network" },
  { href: "/admin/documents", label: "Documents", icon: "Files", feature: "documents", module: "documents", section: "Network" },
  { href: "/admin/compliance", label: "Compliance", icon: "ShieldCheck", feature: "compliance", module: "documents", section: "Network" },
  { href: "/admin/events", label: "Events", icon: "CalendarRange", feature: "events", module: "events", section: "Delivery" },
  { href: "/admin/rfqs", label: "RFQs", icon: "Send", feature: "rfq", module: "rfqs", section: "Procurement" },
  { href: "/admin/quotations", label: "Quotations", icon: "Scale", feature: "quotation", module: "quotations", section: "Procurement" },
  { href: "/admin/purchase-orders", label: "Purchase orders", icon: "FileSpreadsheet", feature: "purchaseOrder", module: "purchaseOrders", section: "Procurement" },
  { href: "/admin/contracts", label: "Contracts", icon: "FileSignature", feature: "contract", module: "contracts", section: "Procurement" },
  { href: "/admin/tasks", label: "Tasks", icon: "ListChecks", feature: "tasks", module: "tasks", section: "Delivery" },
  { href: "/admin/deliveries", label: "Deliveries", icon: "Truck", feature: "delivery", module: "deliveries", section: "Delivery" },
  { href: "/admin/workforce", label: "Workforce", icon: "HardHat", feature: "workforce", module: "workforce", section: "Delivery" },
  { href: "/admin/gate-passes", label: "Gate passes", icon: "QrCode", feature: "gatePass", module: "gatePasses", section: "Delivery" },
  { href: "/admin/invoices", label: "Invoices", icon: "Receipt", feature: "invoices", module: "invoices", section: "Finance" },
  { href: "/admin/payments", label: "Payments", icon: "Wallet", feature: "payments", module: "payments", section: "Finance" },
  { href: "/admin/performance", label: "Performance", icon: "Star", feature: "performance", module: "performance", section: "Insight" },
  { href: "/admin/support", label: "Support", icon: "LifeBuoy", feature: "support", module: "tickets", section: "Insight" },
  { href: "/admin/reports", label: "Reports", icon: "ChartColumn", feature: "reports", module: "reports", section: "Insight" },
  { href: "/admin/notifications", label: "Notifications", icon: "Bell", feature: "notifications", module: "notifications", section: "System" },
  { href: "/admin/users", label: "Users", icon: "Users", module: "users", superOnly: true, section: "System" },
  { href: "/admin/roles", label: "Roles", icon: "KeyRound", module: "roles", superOnly: true, section: "System" },
  { href: "/admin/audit-logs", label: "Audit log", icon: "ScrollText", module: "audit", section: "System" },
  { href: "/admin/features", label: "Features", icon: "ToggleRight", module: "features", superOnly: true, section: "System" },
  { href: "/admin/settings", label: "Settings", icon: "Settings", module: "settings", superOnly: true, section: "System" },
]

export const vendorNav: NavItem[] = [
  { href: "/vendor", label: "Dashboard", icon: "LayoutDashboard", section: "Overview" },
  { href: "/vendor/profile", label: "Company profile", icon: "Building2", module: "vendors", section: "Company" },
  { href: "/vendor/documents", label: "Documents", icon: "Files", feature: "documents", module: "documents", section: "Company" },
  { href: "/vendor/compliance", label: "Compliance", icon: "ShieldCheck", feature: "compliance", module: "documents", section: "Company" },
  { href: "/vendor/events", label: "Events", icon: "CalendarRange", feature: "events", module: "events", section: "Work" },
  { href: "/vendor/rfqs", label: "RFQs", icon: "Send", feature: "rfq", module: "rfqs", section: "Work" },
  { href: "/vendor/quotations", label: "Quotations", icon: "Scale", feature: "quotation", module: "quotations", section: "Work" },
  { href: "/vendor/purchase-orders", label: "Purchase orders", icon: "FileSpreadsheet", feature: "purchaseOrder", module: "purchaseOrders", section: "Work" },
  { href: "/vendor/contracts", label: "Contracts", icon: "FileSignature", feature: "contract", module: "contracts", section: "Work" },
  { href: "/vendor/tasks", label: "Tasks", icon: "ListChecks", feature: "tasks", module: "tasks", section: "Work" },
  { href: "/vendor/deliveries", label: "Deliveries", icon: "Truck", feature: "delivery", module: "deliveries", section: "Work" },
  { href: "/vendor/workforce", label: "Workforce", icon: "HardHat", feature: "workforce", module: "workforce", section: "Work" },
  { href: "/vendor/invoices", label: "Invoices", icon: "Receipt", feature: "invoices", module: "invoices", section: "Finance" },
  { href: "/vendor/payments", label: "Payments", icon: "Wallet", feature: "payments", module: "payments", section: "Finance" },
  { href: "/vendor/support", label: "Support", icon: "LifeBuoy", feature: "support", module: "tickets", section: "Finance" },
  { href: "/vendor/notifications", label: "Notifications", icon: "Bell", feature: "notifications", module: "notifications", section: "Finance" },
]
