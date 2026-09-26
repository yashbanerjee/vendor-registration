export const FEATURE_CATALOG = [
  { key: "vendorRegistration", name: "Vendor Registration", description: "Public and internal vendor onboarding", group: "Vendors", sortOrder: 1 },
  { key: "bulkImport", name: "Bulk Import", description: "CSV and Excel vendor import", group: "Vendors", sortOrder: 2 },
  { key: "vendorVerification", name: "Vendor Verification", description: "Review company, tax, and banking details", group: "Vendors", sortOrder: 3 },
  { key: "vendorApproval", name: "Vendor Approval", description: "Configurable approval workflows", group: "Vendors", sortOrder: 4 },
  { key: "documents", name: "Documents", description: "Vendor document library", group: "Compliance", sortOrder: 5 },
  { key: "compliance", name: "Compliance", description: "Scores, expiry, and reminders", group: "Compliance", sortOrder: 6 },
  { key: "events", name: "Events", description: "Events and vendor assignment", group: "Events", sortOrder: 7 },
  { key: "rfq", name: "RFQ", description: "Requests for quotation", group: "Procurement", sortOrder: 8 },
  { key: "quotation", name: "Quotation", description: "Quotations and comparison", group: "Procurement", sortOrder: 9 },
  { key: "purchaseOrder", name: "Purchase Orders", description: "Purchase orders and PDF", group: "Procurement", sortOrder: 10 },
  { key: "contract", name: "Contracts", description: "NDAs and service contracts", group: "Procurement", sortOrder: 11 },
  { key: "tasks", name: "Tasks", description: "Vendor task tracking", group: "Operations", sortOrder: 12 },
  { key: "workforce", name: "Workforce", description: "Vendor staff registration", group: "Operations", sortOrder: 13 },
  { key: "gatePass", name: "Gate Pass", description: "QR entry passes", group: "Operations", sortOrder: 14 },
  { key: "delivery", name: "Deliveries", description: "Material and vehicle deliveries", group: "Operations", sortOrder: 15 },
  { key: "invoices", name: "Invoices", description: "Vendor invoices", group: "Finance", sortOrder: 16 },
  { key: "payments", name: "Payments", description: "Payment tracking", group: "Finance", sortOrder: 17 },
  { key: "performance", name: "Performance", description: "Post-event vendor scoring", group: "Insights", sortOrder: 18 },
  { key: "support", name: "Support Tickets", description: "Vendor support desk", group: "Insights", sortOrder: 19 },
  { key: "notifications", name: "Notifications", description: "In-app notifications", group: "Platform", sortOrder: 20 },
  { key: "reports", name: "Reports", description: "Operational and finance reports", group: "Platform", sortOrder: 21 },
] as const

export type FeatureKey = (typeof FEATURE_CATALOG)[number]["key"]

export const PERMISSION_MODULES = [
  "vendors",
  "documents",
  "events",
  "rfqs",
  "quotations",
  "purchaseOrders",
  "contracts",
  "tasks",
  "deliveries",
  "workforce",
  "gatePasses",
  "invoices",
  "payments",
  "performance",
  "tickets",
  "reports",
  "users",
  "roles",
  "settings",
  "notifications",
  "audit",
  "features",
] as const

export const PERMISSION_ACTIONS = [
  "VIEW",
  "CREATE",
  "EDIT",
  "DELETE",
  "APPROVE",
  "REJECT",
  "EXPORT",
  "DOWNLOAD",
  "MANAGE",
] as const

export const MODULE_FEATURE: Record<string, string | null> = {
  vendors: "vendorRegistration",
  documents: "documents",
  events: "events",
  rfqs: "rfq",
  quotations: "quotation",
  purchaseOrders: "purchaseOrder",
  contracts: "contract",
  tasks: "tasks",
  deliveries: "delivery",
  workforce: "workforce",
  gatePasses: "gatePass",
  invoices: "invoices",
  payments: "payments",
  performance: "performance",
  tickets: "support",
  reports: "reports",
  notifications: "notifications",
  users: null,
  roles: null,
  settings: null,
  audit: null,
  features: null,
}

export const EMIRATES = [
  { name: "Dubai", code: "DU" },
  { name: "Abu Dhabi", code: "AZ" },
  { name: "Sharjah", code: "SH" },
  { name: "Ajman", code: "AJ" },
  { name: "Ras Al Khaimah", code: "RK" },
  { name: "Fujairah", code: "FU" },
  { name: "Umm Al Quwain", code: "UQ" },
]

export const COMPANY_TYPES = [
  "LLC",
  "SOLE_PROPRIETORSHIP",
  "CIVIL_COMPANY",
  "BRANCH",
  "FREE_ZONE_COMPANY",
  "PARTNERSHIP",
  "OTHER",
]

export const ZONE_TYPES = ["MAINLAND", "FREE_ZONE"]

export const VAT_STATUSES = ["REGISTERED", "NOT_REGISTERED", "EXEMPT", "PENDING"]

export const VENDOR_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "ACTIVE",
  "SUSPENDED",
  "REJECTED",
  "ARCHIVED",
]

export const EVENT_STATUSES = ["DRAFT", "PLANNING", "ACTIVE", "COMPLETED", "CANCELLED"]
export const RFQ_STATUSES = ["DRAFT", "SENT", "CLOSED", "CANCELLED", "AWARDED"]
export const QUOTATION_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"]
export const PO_STATUSES = ["DRAFT", "ISSUED", "ACKNOWLEDGED", "PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED"]
export const CONTRACT_TYPES = ["NDA", "VENDOR_AGREEMENT", "SERVICE_CONTRACT", "EVENT_CONTRACT"]
export const CONTRACT_STATUSES = ["DRAFT", "PENDING_SIGNATURE", "ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED", "RENEWED"]
export const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "COMPLETED", "REJECTED"]
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"]
export const DELIVERY_STATUSES = ["SCHEDULED", "IN_TRANSIT", "ARRIVED", "RECEIVED", "REJECTED", "CANCELLED"]
export const GATE_PASS_TYPES = ["VENDOR", "STAFF", "VEHICLE", "MATERIAL"]
export const GATE_PASS_STATUSES = ["DRAFT", "ISSUED", "USED", "EXPIRED", "REVOKED"]
export const INVOICE_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "PARTIALLY_PAID", "PAID"]
export const PAYMENT_STATUSES = ["PENDING", "APPROVED", "PARTIALLY_PAID", "PAID", "OVERDUE", "REJECTED"]
export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]
export const TICKET_CATEGORIES = ["PAYMENT", "INVOICE", "PO", "EVENT", "DOCUMENTS", "CONTRACT", "TECHNICAL", "GENERAL"]
export const FIELD_TYPES = ["TEXT", "NUMBER", "EMAIL", "PHONE", "DROPDOWN", "MULTI_SELECT", "DATE", "FILE", "CHECKBOX", "RADIO", "TEXTAREA"]
export const DOCUMENT_STATUSES = ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "EXPIRED", "EXPIRING_SOON"]

export const IMPORT_HEADERS = [
  "companyName",
  "tradeName",
  "tradeLicenseNumber",
  "issuingAuthority",
  "businessActivity",
  "vendorCategory",
  "services",
  "contactPerson",
  "email",
  "phone",
  "emirate",
  "address",
  "trn",
  "vatStatus",
  "paymentTerms",
  "bankName",
  "iban",
  "accountName",
] as const

export const ALLOWED_UPLOAD_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

export const ALLOWED_UPLOAD_EXT = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "csv",
  "xls",
  "xlsx",
  "doc",
  "docx",
])
