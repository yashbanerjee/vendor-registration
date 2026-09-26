import { randomBytes } from "crypto"
import { writeFile } from "fs/promises"
import { PrismaClient } from "@prisma/client"
import { ensurePlatformDefaults } from "../src/server/bootstrap"
import { hashPassword } from "../src/server/password"

const prisma = new PrismaClient()

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function password() {
  return `Aa1${randomBytes(6).toString("base64url")}`
}

async function main() {
  await ensurePlatformDefaults()
  const credentials: string[] = ["These accounts are for local development. Passwords are not stored in the repository.", ""]

  const superEmail = (argument("email") || "superadmin@example.com").toLowerCase()
  const superPassword = argument("password") || password()
  const superRole = await prisma.role.findUniqueOrThrow({ where: { slug: "super-admin" } })
  const existingSuper = await prisma.user.findUnique({ where: { email: superEmail } })
  if (!existingSuper) {
    await prisma.user.create({
      data: {
        name: "Super Admin",
        email: superEmail,
        passwordHash: await hashPassword(superPassword),
        portal: "SUPER_ADMIN",
        roleId: superRole.id,
      },
    })
    credentials.push(`Super admin  ${superEmail}  ${superPassword}`)
  } else {
    credentials.push(`Super admin  ${superEmail}  (already existed, password unchanged)`)
  }

  const adminPassword = password()
  const staffPassword = password()
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { slug: "admin" } })
  const staffRole = await prisma.role.findUniqueOrThrow({ where: { slug: "staff" } })
  const vendorRole = await prisma.role.findUniqueOrThrow({ where: { slug: "vendor" } })

  for (const account of [
    { name: "Layla Hassan", email: "admin@example.com", password: adminPassword, roleId: adminRole.id },
    { name: "Omar Faris", email: "staff@example.com", password: staffPassword, roleId: staffRole.id },
  ]) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } })
    if (!existing) {
      await prisma.user.create({
        data: {
          name: account.name,
          email: account.email,
          passwordHash: await hashPassword(account.password),
          portal: "ADMIN",
          roleId: account.roleId,
        },
      })
      credentials.push(`${account.name}  ${account.email}  ${account.password}`)
    }
  }

  const demoCount = await prisma.vendor.count({ where: { isDemo: true } })
  if (demoCount === 0) {
    const categories = await prisma.vendorCategory.findMany()
    const services = await prisma.vendorService.findMany()
    const term = await prisma.paymentTerm.findFirst({ where: { name: "Net 30" } })
    const categoryId = (slug: string) => categories.find((item) => item.slug === slug)?.id
    const serviceId = (name: string) => services.find((item) => item.name === name)?.id

    const companies = [
      ["Al Noor Banquet Kitchen LLC", "Al Noor Kitchen", "catering", "Banquet service", "Dubai", "MAINLAND", "Amina Noor", "amina.noor@example.com"],
      ["Desert Frame Exhibits LLC", "Desert Frame", "exhibition-stand", "Custom stand", "Dubai", "FREE_ZONE", "Hassan Frame", "hassan.frame@example.com"],
      ["Marina Light and Sound LLC", "Marina Light", "av", "Sound system", "Abu Dhabi", "MAINLAND", "Sara Light", "sara.light@example.com"],
      ["Gulf Route Transfers LLC", "Gulf Route", "transportation", "Guest transfer", "Sharjah", "MAINLAND", "Yusuf Route", "yusuf.route@example.com"],
      ["Palm Crew Staffing LLC", "Palm Crew", "staffing", "Registration staff", "Dubai", "FREE_ZONE", "Noora Crew", "noora.crew@example.com"],
      ["Horizon Stage Works LLC", "Horizon Stage", "stage-production", "Stage build", "Dubai", "MAINLAND", "Khalid Stage", "khalid.stage@example.com"],
      ["Clearview Event Photo LLC", "Clearview", "photography", "Event photography", "Ajman", "MAINLAND", "Lina View", "lina.view@example.com"],
      ["Oasis Sign Print LLC", "Oasis Print", "printing", "Signage print", "Ras Al Khaimah", "MAINLAND", "Faisal Print", "faisal.print@example.com"],
    ] as const

    const vendorIds: string[] = []
    for (const [index, company] of companies.entries()) {
      const [legalName, tradeName, category, service, emirate, zone, contact, email] = company
      const vendor = await prisma.vendor.create({
        data: {
          vendorCode: `V-DEMO-${String(index + 1).padStart(4, "0")}`,
          legalName,
          tradeName,
          tradeLicenseNumber: `TL-DEMO-${1000 + index}`,
          licenseAuthority: "Fictitious licensing authority",
          licenseIssueDate: new Date("2024-01-15"),
          licenseExpiryDate: new Date(Date.now() + (index === 0 ? 20 : 200) * 86400000),
          companyType: "LLC",
          businessActivity: category,
          zoneType: zone,
          emirate,
          address: `${emirate} commercial address (fictitious)`,
          trn: `10000000000000${index}`,
          vatStatus: "REGISTERED",
          status: index === 7 ? "SUBMITTED" : "ACTIVE",
          complianceScore: index === 0 ? 80 : 100,
          paymentTermId: term?.id,
          bankName: "Example Bank",
          iban: `AE07033123456789012345${index}`,
          accountName: legalName,
          isDemo: true,
          approvedAt: index === 7 ? null : new Date("2026-01-10"),
          submittedAt: new Date("2026-01-02"),
          contacts: { create: { name: contact, email, phone: `+97150${String(1000000 + index)}`, title: "Operations", isPrimary: true } },
          categories: categoryId(category) ? { create: { categoryId: categoryId(category)! } } : undefined,
          services: serviceId(service) ? { create: { serviceId: serviceId(service)! } } : undefined,
          notes: { create: { body: "Fictitious demo company for local development. Not a real business.", internal: true } },
        },
      })
      vendorIds.push(vendor.id)
      if (index < 3) {
        const vendorPassword = password()
        await prisma.user.create({
          data: {
            name: contact,
            email,
            passwordHash: await hashPassword(vendorPassword),
            portal: "VENDOR",
            roleId: vendorRole.id,
            vendorId: vendor.id,
          },
        })
        credentials.push(`Vendor ${tradeName}  ${email}  ${vendorPassword}`)
      }
    }

    const events = await Promise.all([
      prisma.event.create({
        data: {
          name: "Gulf Design Week",
          code: "EV-DEMO-0001",
          client: "Fictitious Design Council",
          venue: "Dubai Exhibition Centre",
          emirate: "Dubai",
          startDate: new Date("2026-11-12"),
          endDate: new Date("2026-11-15"),
          eventType: "Exhibition",
          status: "ACTIVE",
          isDemo: true,
          description: "Fictitious exhibition used to demonstrate vendor assignment.",
        },
      }),
      prisma.event.create({
        data: {
          name: "Marina Hospitality Forum",
          code: "EV-DEMO-0002",
          client: "Fictitious Hospitality Board",
          venue: "Marina Conference Hall",
          emirate: "Abu Dhabi",
          startDate: new Date("2026-12-03"),
          endDate: new Date("2026-12-04"),
          eventType: "Conference",
          status: "PLANNING",
          isDemo: true,
        },
      }),
    ])

    await prisma.eventVendor.createMany({
      data: [
        { eventId: events[0].id, vendorId: vendorIds[0], category: "Catering", service: "Banquet service", scope: "Lunch service for three show days." },
        { eventId: events[0].id, vendorId: vendorIds[1], category: "Exhibition Stand", service: "Custom stand", scope: "Two island stands." },
        { eventId: events[0].id, vendorId: vendorIds[2], category: "AV", service: "Sound system", scope: "Main stage audio." },
        { eventId: events[1].id, vendorId: vendorIds[3], category: "Transportation", service: "Guest transfer", scope: "Airport transfers." },
      ],
    })

    const rfq = await prisma.rfq.create({
      data: {
        number: "RFQ-DEMO-0001",
        eventId: events[0].id,
        title: "Show catering for Gulf Design Week",
        category: "Catering",
        description: "Fictitious requirement for buffet lunch.",
        quantity: 900,
        unit: "guest",
        deliveryLocation: "Dubai Exhibition Centre",
        requiredDate: new Date("2026-11-12"),
        deadline: new Date("2026-10-20"),
        status: "SENT",
        isDemo: true,
        vendors: { create: { vendorId: vendorIds[0], status: "SUBMITTED" } },
      },
    })

    const quote = await prisma.quotation.create({
      data: {
        number: "QT-DEMO-0001",
        rfqId: rfq.id,
        vendorId: vendorIds[0],
        status: "ACCEPTED",
        subtotal: 45000,
        discount: 0,
        vat: 2250,
        total: 47250,
        isDemo: true,
        notes: "Fictitious quotation.",
        items: { create: [{ description: "Buffet lunch", quantity: 900, unit: "guest", unitPrice: 50, total: 45000 }] },
      },
    })

    const po = await prisma.purchaseOrder.create({
      data: {
        number: "PO-DEMO-0001",
        vendorId: vendorIds[0],
        eventId: events[0].id,
        rfqId: rfq.id,
        quotationId: quote.id,
        status: "ISSUED",
        subtotal: 45000,
        vat: 2250,
        total: 47250,
        paymentTermId: term?.id,
        deliveryDate: new Date("2026-11-12"),
        terms: "Fictitious purchase order for demonstration.",
        isDemo: true,
        items: { create: [{ description: "Buffet lunch", quantity: 900, unit: "guest", unitPrice: 50, total: 45000 }] },
      },
    })

    await prisma.contract.create({
      data: {
        number: "CT-DEMO-0001",
        title: "Catering service agreement",
        type: "EVENT_CONTRACT",
        vendorId: vendorIds[0],
        eventId: events[0].id,
        startDate: new Date("2026-11-01"),
        endDate: new Date("2026-11-20"),
        value: 47250,
        status: "ACTIVE",
        isDemo: true,
        notes: "Fictitious contract.",
      },
    })

    await prisma.invoice.create({
      data: {
        number: "INV-DEMO-0001",
        vendorId: vendorIds[0],
        poId: po.id,
        eventId: events[0].id,
        trn: "100000000000000",
        subtotal: 45000,
        vat: 2250,
        total: 47250,
        status: "SUBMITTED",
        isDemo: true,
        items: { create: [{ description: "Buffet lunch", quantity: 900, unitPrice: 50, total: 45000 }] },
      },
    })

    await prisma.payment.create({
      data: {
        reference: "PAY-DEMO-0001",
        vendorId: vendorIds[0],
        poId: po.id,
        amount: 47250,
        advance: 10000,
        paidAmount: 10000,
        dueDate: new Date("2026-12-01"),
        status: "PARTIALLY_PAID",
        method: "Bank transfer",
        isDemo: true,
      },
    })

    await prisma.task.create({
      data: {
        title: "Confirm kitchen layout",
        description: "Fictitious task for the demo catering vendor.",
        vendorId: vendorIds[0],
        eventId: events[0].id,
        priority: "HIGH",
        dueDate: new Date("2026-10-28"),
        status: "IN_PROGRESS",
        isDemo: true,
      },
    })

    await prisma.delivery.create({
      data: {
        number: "DLV-DEMO-0001",
        vendorId: vendorIds[1],
        eventId: events[0].id,
        material: "Stand panels",
        quantity: 12,
        expectedDate: new Date("2026-11-10"),
        status: "SCHEDULED",
        isDemo: true,
      },
    })

    await prisma.vendorEmployee.create({
      data: {
        vendorId: vendorIds[4],
        eventId: events[0].id,
        name: "Demo Registrar",
        mobile: "+971501112233",
        designation: "Registration host",
        shift: "Morning",
        status: "PENDING",
      },
    })

    await prisma.gatePass.create({
      data: {
        code: "GP-DEMO-0001",
        type: "STAFF",
        vendorId: vendorIds[4],
        eventId: events[0].id,
        holderName: "Demo Registrar",
        validFrom: new Date("2026-11-12"),
        validTo: new Date("2026-11-15"),
        status: "ISSUED",
      },
    })

    await prisma.vendorPerformance.create({
      data: {
        vendorId: vendorIds[2],
        eventId: events[0].id,
        quality: 5,
        delivery: 4,
        pricing: 4,
        communication: 5,
        compliance: 4,
        responsiveness: 5,
        service: 5,
        staff: 4,
        issueResolution: 4,
        comments: "Fictitious score recorded for the demo profile.",
      },
    })

    await prisma.supportTicket.create({
      data: {
        number: "TKT-DEMO-0001",
        vendorId: vendorIds[0],
        category: "PAYMENT",
        priority: "MEDIUM",
        subject: "Advance payment status",
        description: "Fictitious ticket asking about the recorded advance.",
        status: "OPEN",
      },
    })

    const license = await prisma.documentType.findUnique({ where: { slug: "trade-license" } })
    if (license) {
      await prisma.vendorDocument.create({
        data: {
          vendorId: vendorIds[0],
          documentTypeId: license.id,
          title: "Trade license",
          fileName: "not-uploaded.pdf",
          issueDate: new Date("2024-01-15"),
          expiryDate: new Date(Date.now() + 20 * 86400000),
          status: "EXPIRING_SOON",
          notes: "Demo metadata only. No file is attached.",
        },
      })
    }
  }

  const output = credentials.join("\n")
  await writeFile("seed-credentials.txt", output)
  console.log(output)
  console.log("\nSaved to seed-credentials.txt. Demo companies are fictitious.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
