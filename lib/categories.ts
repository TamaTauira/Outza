import { suburbFromAddress } from '@/lib/cities'

export interface CategoryDef {
  name: string
  icon: string
  color: string
  subTags: string[]
}

export const CATEGORIES: CategoryDef[] = [
  { name: 'Music', icon: 'Music', color: '#E8724A', subTags: ['Jazz', 'Hip Hop', 'Rock', 'Electronic/EDM', 'Pop', 'Classical', 'R&B', 'Folk/Acoustic', 'Metal', 'Indie', 'Country', 'World Music', 'Gospel'] },
  { name: 'Arts & Culture', icon: 'Palette', color: '#9B59B6', subTags: ['Theatre', 'Dance', 'Exhibition', 'Comedy', 'Opera', 'Circus', 'Spoken Word', 'Film', 'Photography', 'Visual Arts'] },
  { name: 'Sports', icon: 'Trophy', color: '#27AE60', subTags: ['Football', 'Rugby', 'Cricket', 'Tennis', 'Basketball', 'Swimming', 'Cycling', 'Running', 'Martial Arts', 'Motorsport'] },
  { name: 'Food & Drink', icon: 'UtensilsCrossed', color: '#F39C12', subTags: ['Wine Tasting', 'Beer Festival', 'Food Fair', 'Cocktail', 'Dining Experience', 'Market'] },
  { name: 'Family', icon: 'Baby', color: '#E91E63', subTags: ['Kids Activities', 'School Holiday Events', 'Theme Park', 'Zoo', 'Interactive'] },
  { name: 'Nightlife', icon: 'PartyPopper', color: '#8E44AD', subTags: ['Club Night', 'Bar Event', 'DJ Set', 'Party'] },
  { name: 'Community', icon: 'Users', color: '#1B6CA8', subTags: ['Markets', 'Festival', 'Parade', 'Cultural', 'Fundraiser', 'Volunteering'] },
  { name: 'Business', icon: 'Briefcase', color: '#34495E', subTags: ['Conference', 'Networking', 'Workshop', 'Seminar', 'Expo'] },
  { name: 'Wellness', icon: 'Heart', color: '#1ABC9C', subTags: ['Yoga', 'Meditation', 'Fitness', 'Health', 'Mindfulness'] },
  { name: 'Education', icon: 'GraduationCap', color: '#2980B9', subTags: ['Talk', 'Tour', 'Course', 'Workshop'] },
]

export const SYDNEY_SUBURBS = [
  'CBD', 'Inner West', 'Eastern Suburbs', 'North Shore', 'Northern Beaches',
  'Western Sydney', 'Parramatta', 'South Sydney', 'Hills District',
  'Sutherland Shire', 'Darling Harbour', 'Surry Hills', 'Newtown',
  'Paddington', 'Bondi', 'Manly', 'Chippendale', 'Redfern',
  'Pyrmont', 'Ultimo', 'Glebe', 'Balmain', 'Marrickville',
  'Rozelle', 'Leichhardt', 'Woolloomooloo', 'Potts Point',
  'Kings Cross', 'Darlinghurst', 'Haymarket', 'Circular Quay',
  'The Rocks', 'Barangaroo', 'Sydney Olympic Park',
]

export function classifyCategory(title: string, description: string, genres: string[]): { category: string; subTags: string[] } {
  const text = `${title} ${description} ${genres.join(' ')}`.toLowerCase().replace(/pop[- ]up/g, 'popup')
  const subTags: string[] = []
  let category = 'Community'

  for (const cat of CATEGORIES) {
    for (const tag of cat.subTags) {
      const escaped = tag.toLowerCase().replace(/[.*+?^${}()|[\]\\/&]/g, '\\$&')
      if (new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(text)) {
        category = cat.name
        subTags.push(tag)
      }
    }
  }

  // Genre-based classification
  if (genres.some((g: string) => ['music', 'concert', 'live music'].some((k: string) => g.toLowerCase().includes(k)))) {
    category = 'Music'
  } else if (genres.some((g: string) => ['sport', 'athletic'].some((k: string) => g.toLowerCase().includes(k)))) {
    category = 'Sports'
  } else if (genres.some((g: string) => ['art', 'theatre', 'theater', 'comedy', 'dance', 'film', 'exhibition'].some((k: string) => g.toLowerCase().includes(k)))) {
    category = 'Arts & Culture'
  } else if (genres.some((g: string) => ['food', 'drink', 'wine', 'beer', 'dining'].some((k: string) => g.toLowerCase().includes(k)))) {
    category = 'Food & Drink'
  } else if (genres.some((g: string) => ['family', 'kids', 'children'].some((k: string) => g.toLowerCase().includes(k)))) {
    category = 'Family'
  } else if (genres.some((g: string) => ['business', 'conference', 'seminar'].some((k: string) => g.toLowerCase().includes(k)))) {
    category = 'Business'
  }

  // Text-based fallback
  if (category === 'Community') {
    if (/\b(concert|gig|band|singer|dj|music|festival)\b/.test(text)) category = 'Music'
    else if (/\b(sport|rugby|cricket|football|tennis|nrl|afl)\b/.test(text)) category = 'Sports'
    else if (/\b(theatre|theater|comedy|dance|art|exhibition|gallery|opera|film)\b/.test(text)) category = 'Arts & Culture'
    else if (/\b(food|wine|beer|cocktail|dining|market|brunch)\b/.test(text)) category = 'Food & Drink'
    else if (/\b(kids|family|children|zoo|aquarium)\b/.test(text)) category = 'Family'
    else if (/\b(club|nightlife|party|rave)\b/.test(text)) category = 'Nightlife'
    else if (/\b(yoga|meditation|wellness|fitness|health)\b/.test(text)) category = 'Wellness'
    else if (/\b(conference|workshop|seminar|networking|business)\b/.test(text)) category = 'Business'
    else if (/\b(lecture|talk|course|education|learning|tour)\b/.test(text)) category = 'Education'
  }

  // Strict: a comedy/theatre show is never "Music" just because the source genre says music.
  if (category === 'Music' && /\b(comedy|comedian|stand[- ]?up|theatre|theater|circus|cabaret|burlesque|improv)\b/.test(title.toLowerCase())) category = 'Arts & Culture'
  // Only keep tags that belong to the final category, so the Type column matches the filter.
  const own = CATEGORIES.find((c) => c.name === category)?.subTags ?? []
  return { category, subTags: [...new Set(subTags)].filter((t) => own.includes(t)) }
}

export function checkLGBTI(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase()
  return /\b(lgbti|lgbtq|lgbt|pride|queer|gay|lesbian|trans|gender.?diverse|rainbow|drag.?queen|drag.?show|mardi.?gras)\b/.test(text)
}

export function checkFree(priceStr: string | null | undefined): boolean {
  if (!priceStr) return false
  const p = priceStr.toLowerCase().trim()
  return p === 'free' || p === '$0' || p === '$0.00' || p === '0' || p.includes('free entry') || p.includes('no charge') || p.includes('complimentary')
}

export function guessSuburb(venueName: string, address: string): string | null {
  // A parsed "Coogee" / "Bankstown" beats a CBD keyword. Unknown places stay blank — never default to CBD.
  const parsed = suburbFromAddress(address)
  if (parsed) return parsed
  const text = `${venueName} ${address}`.toLowerCase()
  if (/\b(opera house|circular quay|the rocks|barangaroo)\b/.test(text)) return 'Circular Quay'
  if (/\b(darling harbour|icc|convention|tumbalong)\b/.test(text)) return 'Darling Harbour'
  if (/\b(enmore|newtown|king st)\b/.test(text)) return 'Newtown'
  if (/\b(surry hills)\b/.test(text)) return 'Surry Hills'
  if (/\b(paddington|oxford st)\b/.test(text)) return 'Paddington'
  if (/\b(bondi)\b/.test(text)) return 'Bondi'
  if (/\b(coogee|bronte|randwick|maroubra)\b/.test(text)) return 'Eastern Suburbs'
  if (/\b(bankstown|liverpool|parramatta|blacktown|penrith|campbelltown)\b/.test(text)) {
    if (/\bbankstown\b/.test(text)) return 'Bankstown'
    if (/\bliverpool\b/.test(text)) return 'Liverpool'
    if (/\bblacktown\b/.test(text)) return 'Blacktown'
    if (/\bpenrith\b/.test(text)) return 'Penrith'
    if (/\bcampbelltown\b/.test(text)) return 'Campbelltown'
  }
  if (/\b(manly)\b/.test(text)) return 'Manly'
  if (/\b(parramatta)\b/.test(text)) return 'Parramatta'
  if (/\b(homebush|olympic park|sydney showground)\b/.test(text)) return 'Sydney Olympic Park'
  if (/\b(chippendale|central park)\b/.test(text)) return 'Chippendale'
  if (/\b(redfern|eveleigh|carriageworks)\b/.test(text)) return 'Redfern'
  if (/\b(pyrmont)\b/.test(text)) return 'Pyrmont'
  if (/\b(ultimo)\b/.test(text)) return 'Ultimo'
  if (/\b(glebe)\b/.test(text)) return 'Glebe'
  if (/\b(balmain|rozelle)\b/.test(text)) return 'Balmain'
  if (/\b(marrickville)\b/.test(text)) return 'Marrickville'
  if (/\b(inner west|leichhardt|annandale)\b/.test(text)) return 'Inner West'
  if (/\b(north sydney|north shore|chatswood|st leonards)\b/.test(text)) return 'North Shore'
  if (/\b(moore park|entertainment quarter|hordern|fox studios)\b/.test(text)) return 'Eastern Suburbs'
  if (/\b(kings cross|potts point|woolloomooloo)\b/.test(text)) return 'Potts Point'
  if (/\b(darlinghurst)\b/.test(text)) return 'Darlinghurst'
  if (/\b(haymarket|chinatown)\b/.test(text)) return 'Haymarket'
  if (/\b(luna park|milsons point)\b/.test(text)) return 'North Shore'
  if (/\b(cbd|george st|pitt st|town hall|martin place|wynyard)\b/.test(text)) return 'CBD'
  return null
}
