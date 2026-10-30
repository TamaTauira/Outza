/**
 * Differentiated editorial for free activities, markets and family days out.
 * City topic URLs stay canonical. The national pages only exist as hubs and
 * are indexed when more than one city has a distinct share of the listings.
 */
import type { CityDef } from '@/lib/cities'
import { assessIndexability, type IndexabilityDecision } from '@/lib/indexability'
import type { GuideFact, TopicKey } from '@/lib/seo'

export interface EditorialGuide {
  slug: string
  topic: TopicKey
  label: string
  h1: string
  description: string
}

export const EDITORIAL_GUIDES: EditorialGuide[] = [
  {
    slug: 'free-things-to-do',
    topic: 'free-events',
    label: 'Free things to do',
    h1: 'Free things to do in Australia',
    description: 'Free listings already on VibePeep, split by city. A page here is only as good as the cities that have enough upcoming free events to stand on their own.',
  },
  {
    slug: 'markets',
    topic: 'markets',
    label: 'Markets',
    h1: 'Markets in Australia',
    description: 'Farmers, night, makers and food markets already listed on VibePeep. Each city guide is the full list. This page points at the ones worth opening.',
  },
  {
    slug: 'family-activities',
    topic: 'family',
    label: 'Family-friendly',
    h1: 'Family-friendly things to do in Australia',
    description: 'Listings filed under Family. An all-ages gig in another category stays on that category’s guide.',
  },
]

export const editorialGuide = (slug: string) => EDITORIAL_GUIDES.find((g) => g.slug === slug)
export const editorialPath = (slug: string) => `/guides/${slug}`
export const editorialForTopic = (topic: TopicKey) => EDITORIAL_GUIDES.find((g) => g.topic === topic)

const CITY_NOTE: Record<string, string> = {
  Sydney: 'This is Sydney, not the rest of NSW. Newcastle has its own guide.',
  Newcastle: 'This is Newcastle, not Sydney. The two cities are not blended.',
  Melbourne: 'This is Melbourne, not the rest of Victoria.',
  Brisbane: 'This is Brisbane. The Gold Coast has its own guide.',
  'Gold Coast': 'This is the Gold Coast, not Brisbane.',
  Perth: 'This is Perth, not the rest of Western Australia.',
  Adelaide: 'This is Adelaide, not the rest of South Australia.',
  Canberra: 'This is Canberra. Listings over the NSW border stay off unless the address is actually here.',
  Hobart: 'This is Hobart, not the whole of Tasmania.',
  Darwin: 'This is Darwin, not the whole of the Territory.',
}

export interface CityEditorial {
  paragraphs: string[]
  more: { href: string; label: string }
  facts: GuideFact[]
}

/** Stable explainer for a city topic page. Counts and dates stay in the live intro, not here. */
export function cityEditorial(topic: TopicKey, city: CityDef): CityEditorial | null {
  const hub = editorialForTopic(topic)
  const place = CITY_NOTE[city.name]
  if (!hub || !place) return null
  if (topic === 'free-events') {
    return {
      paragraphs: [
        `Free in ${city.name} means the listing is marked free. A gold-coin donation, a cheap ticket, or a “kids free” note does not sneak onto this page.`,
        `${place} Suburb links show up only once a neighbourhood has enough upcoming listings to be its own page.`,
      ],
      more: { href: hub.slug ? editorialPath(hub.slug) : editorialPath('free-things-to-do'), label: 'Free things to do in other cities' },
      facts: [
        {
          question: `What counts as a free event in ${city.name}?`,
          answer: 'The listing has to be marked free. Gold-coin entry and cheap tickets stay on the main events guide. If the organiser’s page disagrees with the badge, trust the organiser.',
        },
        {
          question: `Does this include all of ${city.state}?`,
          answer: place,
        },
      ],
    }
  }
  if (topic === 'markets') {
    return {
      paragraphs: [
        `Farmers, night, makers and food markets in ${city.name}. A workshop with “market” in the title stays off, and so does anything filed as a business listing.`,
        `${place} A market that runs every weekend shows its next date, then drops off after that date passes.`,
      ],
      more: { href: editorialPath('markets'), label: 'Markets in other cities' },
      facts: [
        {
          question: `Which markets show up in ${city.name}?`,
          answer: 'Upcoming farmers, night, makers and food markets. Business listings and anything that only talks about marketing are left out.',
        },
        {
          question: `Does this include all of ${city.state}?`,
          answer: place,
        },
      ],
    }
  }
  if (topic === 'family') {
    return {
      paragraphs: [
        `These are listings filed under Family in ${city.name}: shows, workshops and days out aimed at families. An all-ages gig in another category is not pulled in just because kids could tag along.`,
        `${place} Age rules appear on an event only when the organiser published them.`,
      ],
      more: { href: editorialPath('family-activities'), label: 'Family activities in other cities' },
      facts: [
        {
          question: `What makes a listing family-friendly in ${city.name}?`,
          answer: 'It is filed under Family. VibePeep does not guess from the title. Check the event page for any age note the organiser actually wrote.',
        },
        {
          question: `Does this include all of ${city.state}?`,
          answer: place,
        },
      ],
    }
  }
  return null
}

export interface EditorialAssessment extends IndexabilityDecision {
  total: number
}

/**
 * National hub gate. One city holding the listings is a near-duplicate of that
 * city’s own guide. Zero listings is empty (404). A thin spread is noindex.
 */
export function assessEditorial(perCity: number[]): EditorialAssessment {
  const totals = perCity.filter((n) => n > 0)
  const total = totals.reduce((sum, n) => sum + n, 0)
  const biggest = totals.reduce((max, n) => Math.max(max, n), 0)
  const parentOverlap = totals.length === 0 ? null : totals.length === 1 ? 1 : biggest / total
  const gate = assessIndexability({ total, parentOverlap, mode: 'editorial' })
  return { ...gate, total }
}

export function editorialFacts(guide: EditorialGuide, total: number, cityCount: number): GuideFact[] {
  const count = total > 0
    ? `VibePeep currently has ${total} upcoming ${total === 1 ? 'listing' : 'listings'} across ${cityCount} ${cityCount === 1 ? 'city' : 'cities'} for this topic.`
    : 'No city has an upcoming listing for this topic right now.'
  return [
    {
      question: `What is on this ${guide.label.toLowerCase()} page?`,
      answer: `${guide.description} ${count}`,
    },
    {
      question: 'Why are some cities missing?',
      answer: 'A city is linked when it has at least one upcoming listing for this topic. It is only treated as a search page in its own right once it clears the same listing bar as every other guide.',
    },
  ]
}
