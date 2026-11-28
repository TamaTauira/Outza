import { listPriceLabel, readPrice } from '@/lib/price'

/** Shown when a listing has no published amount. Free stays “Free”. */
export const PRICE_TBA = 'Price TBA'

const MISSING_PRICE = /^(?:tba|tbc|n\/?a|price tba|price tbc|see website|see listing|tickets at source|price not published|ask the organiser|not listed|unknown|coming soon|poa|price on application|various|[-—–])$/i

export type EventDetailPrice = { label: string; kind: 'free' | 'paid' | 'tba' }

function tidy(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function missing(value: string): boolean {
  return MISSING_PRICE.test(value)
}

/**
 * One price line for the event sheet and the full event page.
 * A real amount or “Free” is kept. Blank, TBA and “see website” all read as Price TBA.
 */
export function eventDetailPrice(input: {
  isFree?: boolean | null
  price?: string | null
  priceMin?: number | null
  priceMax?: number | null
  range?: string | null
}): EventDetailPrice {
  const range = tidy(input.range)
  if (range && !missing(range)) {
    if (/^free$/i.test(range)) return { label: 'Free', kind: 'free' }
    // A supplied range is a summary computed earlier (and possibly cached);
    // one that resolves past the sanity bound is not a price, whatever it
    // claims — fall through to the field resolution, which suppresses it too.
    if (!readPrice(range).suppressed) return { label: range, kind: 'paid' }
  }
  const formatted = listPriceLabel(!!input.isFree, input.price ?? null, input.priceMin, input.priceMax)
  if (formatted.kind === 'free') return { label: 'Free', kind: 'free' }
  if (formatted.kind === 'paid' && !missing(formatted.text)) return { label: formatted.text, kind: 'paid' }
  return { label: PRICE_TBA, kind: 'tba' }
}
