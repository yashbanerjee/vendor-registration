import { prisma } from "@/server/db"

export async function vatContext() {
  const tax = await prisma.taxSetting.findUnique({ where: { id: "default" } })
  if (!tax?.vatEnabled) return { rate: 0, label: tax?.vatLabel || "VAT", currency: tax?.currency || "AED" }
  return { rate: Number(tax.vatRate), label: tax.vatLabel, currency: tax.currency }
}

export function priceDocument(input: {
  items: { description: string; quantity: number; unit?: string | null; unitPrice: number }[]
  discount?: number
  delivery?: number
  vatRate: number
}) {
  const items = input.items
    .filter((item) => item.description?.trim())
    .map((item) => {
      const quantity = Number(item.quantity) || 0
      const unitPrice = Number(item.unitPrice) || 0
      return {
        description: item.description.trim(),
        quantity,
        unit: item.unit || null,
        unitPrice,
        total: Math.round(quantity * unitPrice * 100) / 100,
      }
    })
  if (!items.length) return null
  const subtotal = round(items.reduce((sum, item) => sum + item.total, 0))
  const discount = round(Math.min(Math.max(0, Number(input.discount) || 0), subtotal))
  const delivery = round(Math.max(0, Number(input.delivery) || 0))
  const taxable = round(subtotal - discount + delivery)
  const vat = round(taxable * (input.vatRate / 100))
  const total = round(taxable + vat)
  return { items, subtotal, discount, delivery, vat, total }
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
