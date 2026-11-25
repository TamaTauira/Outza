import type { Metadata } from 'next'
import { BRAND_NAME } from '@/lib/brand'

/** One document-title pattern. The root layout template appends the brand. */
export const TITLE_TEMPLATE = `%s · ${BRAND_NAME}`

/** Drop a brand suffix or prefix so the template does not add a second one. */
export function titleLead(title: string): string {
  const trimmed = title.replace(/\s+/g, ' ').trim()
  const suffix = trimmed
    .replace(new RegExp(`\\s*[|·—–-]\\s*${BRAND_NAME}(?:\\s+Local)?\\s*$`, 'i'), '')
    .replace(new RegExp(`^${BRAND_NAME}\\s*[|·—–-]\\s*`, 'i'), '')
    .trim()
  return suffix || trimmed
}

export function brandedTitle(title: string): string {
  const lead = titleLead(title)
  if (!lead || lead.toLowerCase() === BRAND_NAME.toLowerCase()) return BRAND_NAME
  return `${lead} · ${BRAND_NAME}`
}

/** Canonical URL, document title and og:title for one page. */
export function pageMeta(opts: {
  title: string
  description?: string
  path: string
  index?: boolean
}): Metadata {
  const lead = titleLead(opts.title)
  const branded = brandedTitle(lead)
  const robots = opts.index === false ? { index: false, follow: false } : undefined
  return {
    title: lead,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: {
      title: branded,
      description: opts.description,
      url: opts.path,
    },
    twitter: {
      card: 'summary_large_image',
      title: branded,
      description: opts.description,
    },
    robots,
  }
}
