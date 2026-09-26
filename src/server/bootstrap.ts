import { FEATURE_CATALOG, PERMISSION_MODULES } from "@/lib/constants"
import type { HomepageContent } from "@/lib/types"
import { prisma } from "@/server/db"
import { hashPassword } from "@/server/password"

const homepage: HomepageContent = {
  headline: "Manage Your Entire Vendor Network in One Place",
  subheadline:
    "A vendor operations platform for UAE event, exhibition, conference, hospitality, and procurement teams. Onboard suppliers, keep documents current, and run work from the first RFQ through payment.",
  features: [
    { title: "Vendor onboarding", text: "Collect company, licence, tax, and banking details through a guided registration or a controlled bulk import." },
    { title: "Compliance", text: "Track trade licences, VAT certificates, insurance, and expiry reminders without burying the rules in code." },
    { title: "RFQ and quotations", text: "Invite the right categories, collect line-item quotes, and compare them before you commit." },
    { title: "Procurement", text: "Turn an accepted quotation into a purchase order with VAT, payment terms, and a downloadable PDF." },
    { title: "Events", text: "Assign vendors to an event by category, service, and scope, then follow tasks and deliveries against that event." },
    { title: "Documents", text: "Keep licences, contracts, and event files on the vendor record with review status and rejection reasons." },
    { title: "Contracts", text: "Hold NDAs, vendor agreements, and event contracts with renewal dates and signed copies." },
    { title: "Payments", text: "See invoice, advance, paid, and outstanding amounts against each purchase order." },
    { title: "Performance", text: "Score quality, delivery, communication, and compliance after the event, and keep the history on the vendor profile." },
  ],
  steps: [
    { title: "Register", text: "Vendors apply online or your team imports an existing list." },
    { title: "Verify", text: "Compliance, finance, and management review the file in the order you configure." },
    { title: "Engage", text: "Assign approved vendors to events, RFQs, purchase orders, and contracts." },
    { title: "Deliver", text: "Track tasks, workforce, gate passes, and deliveries through the event." },
    { title: "Settle", text: "Review invoices, record payments, and score the vendor for the next engagement." },
  ],
  faqs: [
    { q: "Who is this platform for?", a: "Event, exhibition, conference, hospitality, procurement, and corporate teams that work with a network of UAE vendors." },
    { q: "Can we change registration fields later?", a: "Yes. A super admin can add fields, mark them required, and limit them to selected vendor categories without a code change." },
    { q: "Does the system assume a fixed VAT rate?", a: "No. VAT, currency, reminder windows, categories, and approval steps are stored as settings." },
    { q: "Can a vendor see other vendors?", a: "No. Vendor users only see their own company, documents, commercial records, and tasks." },
    { q: "Where is company branding stored?", a: "Name, logo, colours, contact details, and website copy are edited in System Settings. The environment file only holds the database connection." },
  ],
}

const privacy = `This policy describes how the vendor platform handles information submitted through the public website, staff workspace, and vendor portal.

Information we store includes account details, company and tax information you choose to collect, uploaded documents, commercial records, and technical logs such as sign-in time and IP address. These records are used to operate vendor onboarding, compliance, procurement, and support.

Access is limited by role. Vendors can see their own records. Staff can see the modules their role allows. A super admin can configure the company profile, fields, and features.

Files are stored with type and size checks. Do not upload information you are not authorised to share.

This text is a starting point. Replace it from System Settings before you rely on it as your public policy.`

const terms = `These terms govern use of the vendor platform by staff and vendor users.

Accounts are personal. Keep passwords private and tell your administrator if an account should be closed. Information submitted in a registration must be accurate to the best of the submitter's knowledge.

Commercial records such as quotations, purchase orders, and invoices are operational records inside this system. They do not replace a signed contract unless your organisation decides they do.

The operator of this installation may suspend a vendor or user where documents are expired, information is misleading, or access is no longer appropriate.

This text is a starting point. Replace it from System Settings before publishing it as your terms.`

function permissions(modules: string[], actions: string[]) {
  return modules.map((module) => ({ module, actions }))
}

export async function ensurePlatformDefaults() {
  await prisma.companySetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      companyName: "Vedha Technologies",
      legalName: "Vedha Technologies LLC-FZ",
      email: "info@vedha.ae",
      phone: "+971 50 658 3342",
      website: "https://vedha.ae",
      address: "Dubai, United Arab Emirates",
      emirate: "Dubai",
      country: "United Arab Emirates",
      tagline: "Custom software development company in Dubai",
      about:
        "Vedha Technologies is a software development company in Dubai. This vendor desk is how the team invites suppliers, reviews their details, and runs procurement after approval.",
      heroHeadline: homepage.headline,
      heroSubtext: homepage.subheadline,
      privacyPolicy: privacy,
      terms,
      primaryColor: "#111111",
      secondaryColor: "#C4A574",
      currency: "AED",
      timezone: "Asia/Dubai",
      homepage,
    },
  })

  await prisma.taxSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      vatEnabled: true,
      vatRate: 5,
      vatLabel: "VAT",
      trnRequired: false,
      corporateTaxNote: "Capture the vendor's corporate tax position as information. Do not treat this note as tax advice.",
      currency: "AED",
    },
  })

  const settings: { key: string; value: unknown; group: string }[] = [
    { key: "documents.reminderDays", value: [60, 30, 15, 7, 1], group: "documents" },
    { key: "uploads.maxMb", value: 10, group: "uploads" },
    { key: "registration.allowPublic", value: false, group: "registration" },
  ]
  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value as never, group: setting.group },
    })
  }

  for (const feature of FEATURE_CATALOG) {
    await prisma.featureFlag.upsert({
      where: { key: feature.key },
      update: {},
      create: feature,
    })
  }

  const emirates = [
    ["Dubai", "DU"],
    ["Abu Dhabi", "AZ"],
    ["Sharjah", "SH"],
    ["Ajman", "AJ"],
    ["Ras Al Khaimah", "RK"],
    ["Fujairah", "FU"],
    ["Umm Al Quwain", "UQ"],
  ]
  for (const [index, [name, code]] of emirates.entries()) {
    await prisma.emirate.upsert({
      where: { code },
      update: {},
      create: { name, code, sortOrder: index + 1 },
    })
  }

  const termsList = [
    ["Due on receipt", 0],
    ["Net 15", 15],
    ["Net 30", 30],
    ["Net 45", 45],
    ["Net 60", 60],
  ] as const
  for (const [name, days] of termsList) {
    await prisma.paymentTerm.upsert({
      where: { name },
      update: {},
      create: { name, days, description: days === 0 ? "Payable when the invoice is approved." : `Payable ${days} days after invoice approval.` },
    })
  }

  const documents = [
    ["Trade License", "trade-license", true, true],
    ["VAT Certificate", "vat-certificate", false, true],
    ["Bank Letter", "bank-letter", false, false],
    ["IBAN Certificate", "iban-certificate", false, false],
    ["Insurance", "insurance", false, true],
    ["Certification", "certification", false, true],
    ["Company Document", "company-document", false, false],
    ["ID Document", "id-document", false, true],
    ["NDA", "nda", false, false],
    ["Contract", "contract", false, true],
    ["Event Document", "event-document", false, false],
  ] as const
  for (const [name, slug, required, hasExpiry] of documents) {
    await prisma.documentType.upsert({
      where: { slug },
      update: {},
      create: { name, slug, required, hasExpiry },
    })
  }

  const categories: { name: string; slug: string; documents: string[] }[] = [
    { name: "Catering", slug: "catering", documents: ["trade-license", "vat-certificate"] },
    { name: "Security", slug: "security", documents: ["trade-license", "insurance"] },
    { name: "AV", slug: "av", documents: ["trade-license"] },
    { name: "Lighting", slug: "lighting", documents: ["trade-license"] },
    { name: "Stage Production", slug: "stage-production", documents: ["trade-license", "insurance"] },
    { name: "Fabrication", slug: "fabrication", documents: ["trade-license"] },
    { name: "Exhibition Stand", slug: "exhibition-stand", documents: ["trade-license"] },
    { name: "Transportation", slug: "transportation", documents: ["trade-license", "insurance"] },
    { name: "Logistics", slug: "logistics", documents: ["trade-license"] },
    { name: "Printing", slug: "printing", documents: ["trade-license"] },
    { name: "Photography", slug: "photography", documents: ["trade-license"] },
    { name: "Videography", slug: "videography", documents: ["trade-license"] },
    { name: "Cleaning", slug: "cleaning", documents: ["trade-license"] },
    { name: "Staffing", slug: "staffing", documents: ["trade-license", "insurance"] },
    { name: "Decoration", slug: "decoration", documents: ["trade-license"] },
    { name: "Furniture Rental", slug: "furniture-rental", documents: ["trade-license"] },
    { name: "Entertainment", slug: "entertainment", documents: ["trade-license"] },
  ]
  for (const category of categories) {
    await prisma.vendorCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: {
        name: category.name,
        slug: category.slug,
        requiredDocumentTypes: category.documents,
      },
    })
  }

  const serviceSeeds = [
    ["catering", "Banquet service"],
    ["catering", "Coffee station"],
    ["security", "Event security"],
    ["av", "Sound system"],
    ["av", "LED screen"],
    ["lighting", "Stage lighting"],
    ["stage-production", "Stage build"],
    ["exhibition-stand", "Custom stand"],
    ["transportation", "Guest transfer"],
    ["logistics", "Warehouse handling"],
    ["printing", "Signage print"],
    ["photography", "Event photography"],
    ["videography", "Highlight film"],
    ["cleaning", "Overnight cleaning"],
    ["staffing", "Registration staff"],
    ["decoration", "Floral styling"],
    ["furniture-rental", "Lounge furniture"],
    ["entertainment", "Live performance"],
    ["fabrication", "Joinery"],
  ] as const
  for (const [slug, name] of serviceSeeds) {
    const category = await prisma.vendorCategory.findUnique({ where: { slug } })
    if (!category) continue
    await prisma.vendorService.upsert({
      where: { categoryId_name: { categoryId: category.id, name } },
      update: {},
      create: { categoryId: category.id, name },
    })
  }

  const templates = [
    ["registration", "Registration received", "{{vendor}} submitted a registration", "{{vendor}} is waiting for review."],
    ["approval", "Vendor approved", "{{vendor}} was approved", "{{actor}} approved {{vendor}}."],
    ["rejection", "Vendor rejected", "{{vendor}} was rejected", "{{actor}} rejected {{vendor}}. {{note}}"],
    ["changes_requested", "Changes requested", "Changes requested for {{vendor}}", "{{actor}} asked {{vendor}} to update the application. {{note}}"],
    ["document_rejected", "Document rejected", "{{document}} needs attention", "{{document}} for {{vendor}} was rejected. {{note}}"],
    ["document_expiry", "Document expiry", "{{document}} is expiring", "{{document}} for {{vendor}} expires on {{date}}."],
    ["rfq", "RFQ invitation", "RFQ {{number}}", "You are invited to quote on {{title}}."],
    ["quotation", "Quotation submitted", "Quotation {{number}}", "{{vendor}} submitted a quotation for {{title}}."],
    ["purchase_order", "Purchase order", "Purchase order {{number}}", "Purchase order {{number}} was issued to {{vendor}}."],
    ["task", "Task update", "Task: {{title}}", "{{title}} is now {{status}}."],
    ["delivery", "Delivery update", "Delivery {{number}}", "Delivery {{number}} for {{vendor}} is {{status}}."],
    ["invoice", "Invoice update", "Invoice {{number}}", "Invoice {{number}} from {{vendor}} is {{status}}."],
    ["payment", "Payment update", "Payment {{number}}", "Payment {{number}} for {{vendor}} is {{status}}."],
    ["contract_expiry", "Contract expiry", "{{title}} is nearing its end date", "{{title}} with {{vendor}} ends on {{date}}."],
  ] as const
  for (const [key, name, subject, body] of templates) {
    await prisma.notificationTemplate.upsert({
      where: { key },
      update: {},
      create: { key, name, subject, body },
    })
  }

  const workflow = await prisma.approvalWorkflow.findFirst({ where: { module: "vendor_registration", categoryId: null } })
  if (!workflow) {
    await prisma.approvalWorkflow.create({
      data: {
        name: "Vendor registration",
        module: "vendor_registration",
        steps: {
          create: [
            { name: "Compliance", sortOrder: 1 },
            { name: "Finance", sortOrder: 2 },
            { name: "Management", sortOrder: 3 },
            { name: "Final Approval", sortOrder: 4 },
          ],
        },
      },
    })
  }

  await prisma.customField.upsert({
    where: { key: "years_operating" },
    update: {},
    create: {
      key: "years_operating",
      label: "Years operating in the UAE",
      fieldType: "NUMBER",
      section: "business",
      placeholder: "8",
      sortOrder: 1,
    },
  })

  const all = permissions([...PERMISSION_MODULES], ["MANAGE"])
  const adminModules = PERMISSION_MODULES.filter((module) => !["roles", "features", "settings"].includes(module))
  const admin = [
    ...permissions([...adminModules], ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "REJECT", "EXPORT", "DOWNLOAD"]),
    ...permissions(["settings"], ["VIEW"]),
  ]
  const staff = permissions(
    ["vendors", "documents", "events", "rfqs", "quotations", "purchaseOrders", "contracts", "tasks", "deliveries", "workforce", "gatePasses", "invoices", "payments", "performance", "tickets", "reports", "notifications"],
    ["VIEW", "CREATE", "EDIT", "EXPORT", "DOWNLOAD"],
  )
  const vendor = [
    ...permissions(["vendors", "documents", "quotations", "tasks", "deliveries", "workforce", "invoices", "tickets"], ["VIEW", "CREATE", "EDIT"]),
    ...permissions(["events", "rfqs", "purchaseOrders", "contracts", "gatePasses", "payments", "performance", "notifications"], ["VIEW"]),
  ]

  const roles = [
    ["Super Admin", "super-admin", "SUPER_ADMIN" as const, "Full control of the installation.", true, all],
    ["Admin", "admin", "ADMIN" as const, "Operates vendors, procurement, and finance.", true, admin],
    ["Staff", "staff", "ADMIN" as const, "Day-to-day event and vendor coordination.", true, staff],
    ["Vendor", "vendor", "VENDOR" as const, "Access limited to the vendor's own records.", true, vendor],
  ] as const

  for (const [name, slug, portal, description, isSystem, perms] of roles) {
    const role = await prisma.role.upsert({
      where: { slug },
      update: {},
      create: { name, slug, portal, description, isSystem },
    })
    for (const permission of perms) {
      await prisma.permission.upsert({
        where: { roleId_module: { roleId: role.id, module: permission.module } },
        update: {},
        create: { roleId: role.id, module: permission.module, actions: [...permission.actions] },
      })
    }
  }
}

export async function createSuperAdmin(input: { name: string; email: string; password: string }) {
  const existing = await prisma.user.findFirst({ where: { portal: "SUPER_ADMIN", deletedAt: null } })
  if (existing) return existing
  await ensurePlatformDefaults()
  const role = await prisma.role.findUnique({ where: { slug: "super-admin" } })
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      portal: "SUPER_ADMIN",
      roleId: role?.id,
      status: "ACTIVE",
    },
  })
}
