/**
 * Tax invoice numbers and the list-price line for a Pro discount.
 * Numbers come from a Postgres sequence so they stay unique and stable per purchase.
 */
import { prisma } from '@/lib/db'
import { ADDONS, TIERS, applyPro, isDuration, type Duration } from '@/lib/tiers'

export function formatInvoiceNumber(n: number): string {
  return `VP-${String(n).padStart(6, '0')}`
}

/** Same purchase id always returns the same number. Safe to call on every invoice view. */
export async function invoiceNumberFor(purchaseId: string): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<{ number: number }[]>`
      INSERT INTO "InvoiceSeq" ("id", "number")
      VALUES (${purchaseId}, nextval('invoice_number_seq'))
      ON CONFLICT ("id") DO UPDATE SET "number" = "InvoiceSeq"."number"
      RETURNING "number"
    `
    const n = rows[0]?.number
    return typeof n === 'number' ? n : null
  } catch (err) {
    console.error('[invoice-number]', err)
    return null
  }
}

export interface DiscountLine {
  listCents: number
  paidCents: number
  discountCents: number
}

/** When the stored charge is exactly the Pro price for that package, show list and 15% off. */
export function proDiscountLine(tier: string, days: number | null | undefined, paidCents: number): DiscountLine | null {
  if (!isDuration(days)) return null
  const def = TIERS.find((t) => t.key === tier) ?? ADDONS.find((a) => a.key === tier)
  if (!def) return null
  const listCents = def.prices[days as Duration]
  const discounted = applyPro(listCents, true)
  if (paidCents === listCents) return { listCents, paidCents, discountCents: 0 }
  if (paidCents === discounted && discounted !== listCents) return { listCents, paidCents, discountCents: listCents - paidCents }
  return null
}
