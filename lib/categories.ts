import { BRAND_ORANGE } from '@/lib/brand'
import { requireEveryCity, suburbFromAddress, tidyVenueName } from '@/lib/cities'
import { readPrice } from '@/lib/price'
import { foldSearchText } from '@/lib/search-fold'
import { dropBroadTheatre, listingText, lgbtiFromSources, proseEvidence, retagLgbti, sportSignal, tagsFromGenreLabels } from '@/lib/tag-evidence'

export interface CategoryDef {
  name: string
  icon: string
  color: string
  subTags: string[]
}

export const CATEGORIES: CategoryDef[] = [
  { name: 'Music', icon: 'Music', color: '#C2410C', subTags: ['Jazz', 'Hip Hop', 'Rock', 'Electronic/EDM', 'Pop', 'Classical', 'R&B', 'Folk/Acoustic', 'Metal', 'Indie', 'Country', 'World Music', 'Gospel'] },
  { name: 'Arts & Culture', icon: 'Palette', color: '#6D28D9', subTags: ['Theatre', 'Dance', 'Exhibition', 'Comedy', 'Opera', 'Circus', 'Spoken Word', 'Film', 'Photography', 'Visual Arts'] },
  { name: 'Sports', icon: 'Trophy', color: '#15803D', subTags: ['Football', 'Rugby', 'Cricket', 'Tennis', 'Basketball', 'Swimming', 'Cycling', 'Running', 'Martial Arts', 'Motorsport'] },
  { name: 'Food & Drink', icon: 'UtensilsCrossed', color: '#B45309', subTags: ['Wine Tasting', 'Beer Festival', 'Food Fair', 'Cocktail', 'Dining Experience', 'Market'] },
  { name: 'Family', icon: 'Baby', color: '#BE185D', subTags: ['Kids Activities', 'School Holiday Events', 'Theme Park', 'Zoo', 'Interactive'] },
  { name: 'Nightlife', icon: 'PartyPopper', color: '#6B21A8', subTags: ['Club Night', 'Bar Event', 'DJ Set', 'Party'] },
  { name: 'Community', icon: 'Users', color: '#1D4ED8', subTags: ['Markets', 'Festival', 'Parade', 'Cultural', 'Fundraiser', 'Volunteering', 'Dating', 'Social'] },
  { name: 'Business', icon: 'Briefcase', color: '#1F2937', subTags: ['Conference', 'Networking', 'Workshop', 'Seminar', 'Expo'] },
  { name: 'Wellness', icon: 'Leaf', color: '#0F766E', subTags: ['Yoga', 'Meditation', 'Fitness', 'Health', 'Mindfulness'] },
  { name: 'Education', icon: 'GraduationCap', color: '#1E40AF', subTags: ['Talk', 'Tour', 'Course', 'Workshop'] },
]

/** Solid fill for a category chip or email placeholder. Unknown names use the brand midpoint. */
export function categoryColor(name: string): string {
  const key = name.trim().toLowerCase()
  return CATEGORIES.find((c) => c.name.toLowerCase() === key)?.color ?? BRAND_ORANGE
}

const INK_DARK = '#1A1408'
const INK_LIGHT = '#ffffff'

function hexChannels(bg: string): [number, number, number] | null {
  const raw = bg.trim().replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

function channelLuma(channel: number): number {
  const s = channel / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function relativeLuma(r: number, g: number, b: number): number {
  return 0.2126 * channelLuma(r) + 0.7152 * channelLuma(g) + 0.0722 * channelLuma(b)
}

function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/** Ink that stays at AA (4.5:1) on a category fill. Orange no longer falls back to white. */
export function categoryInk(bg: string): string {
  const rgb = hexChannels(bg)
  if (!rgb) return INK_DARK
  const luma = relativeLuma(rgb[0], rgb[1], rgb[2])
  const onWhite = contrastRatio(luma, 1)
  const onDark = contrastRatio(luma, relativeLuma(0x1a, 0x14, 0x08))
  if (onWhite >= 4.5 && onWhite >= onDark) return INK_LIGHT
  return INK_DARK
}

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

const WEAK_TAGS = new Set(['Running', 'Course', 'Tour', 'Talk', 'Workshop', 'Health', 'Party', 'Market', 'Networking', 'Interactive', 'Social'])
const TIE_BREAK = ['Community', 'Education', 'Wellness', 'Nightlife', 'Family', 'Food & Drink', 'Sports', 'Arts & Culture', 'Music']
const ADULT = /\b(18\+|adults? only|over 18|R18)\b/i
const FAMILY_FALSE = /\bfamily(?:[-\s]+(?:planning|history|violence|law|business|owned|run|recipe|tree)|\s+owned)\b/i
const CRAFT_MARKET = /\b(craft|makers?|artisan|vintage|flea|preloved|swap|trash and treasure|record[\s-]?fair|design)\b/i
const FOOD_MARKET = /\b(food|produce|farmers?|wine|beer|eat|meal|dinner|lunch)\b/i
const FAITH_COMMUNITY = /\b(church|faith|bible|craft circle|autistic adults)\b/i
const PERFORMER_TOUR = /\b(?:world|australian|aus|national|album|farewell|reunion|anniversary|headline|debut|comedy|stand-?up|summer|winter|spring|autumn|east coast) tour\b|\bon tour\b/i

export function classifyCategory(title: string, description: string, genres: string[]): { category: string; subTags: string[] } {
  const proseText = listingText(title, description)
  const scores = new Map<string, number>()
  const found = new Map<string, string[]>()
  const add = (name: string, points: number, tag?: string) => {
    scores.set(name, (scores.get(name) ?? 0) + points)
    if (!tag) return
    const list = found.get(name) ?? []
    if (!list.includes(tag)) found.set(name, [...list, tag])
  }
  for (const cat of CATEGORIES) {
    for (const tag of cat.subTags) {
      if (tag === 'Social') {
        if (proseEvidence('Social', title) === 'clear' || proseEvidence('Social', description) === 'clear') add(cat.name, 0, 'Social')
        continue
      }
      if (tag === 'Market' && CRAFT_MARKET.test(title) && !FOOD_MARKET.test(title)) {
        if (proseEvidence('Market', title) === 'clear') add('Community', 3, 'Markets')
        continue
      }
      const inTitle = proseEvidence(tag, title) === 'clear'
      const inDesc = !inTitle && proseEvidence(tag, description) === 'clear'
      if (!inTitle && !inDesc) continue
      const points = inTitle ? (WEAK_TAGS.has(tag) ? 2 : 3) : WEAK_TAGS.has(tag) ? 0.5 : 1
      add(cat.name, points, tag)
    }
  }
  const source = tagsFromGenreLabels(genres)
  if (source.category) add(source.category, 2)
  for (const tag of source.subTags) {
    const owner = CATEGORIES.find((cat) => cat.subTags.includes(tag))
    if (owner) add(owner.name, 0, tag)
  }

  let category = 'Community'
  let best = 0
  for (const [name, score] of scores) {
    if (score < 1) continue
    const better = score > best || (score === best && TIE_BREAK.indexOf(name) > TIE_BREAK.indexOf(category))
    if (better) { best = score; category = name }
  }
  const subTags = [...(found.get(category) ?? [])]

  const text = `${proseText} ${genres.join(' ')}`.toLowerCase().replace(FAMILY_FALSE, ' ')
  const genreText = genres.join('\n')
  const genreHas = (words: string[], sourceText = genreText) =>
    words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(sourceText))
  if (best < 1 && !source.category) {
    if (genreHas(['music', 'concert', 'live music'])) category = 'Music'
    else if (genreHas(['sport', 'athletic'])) category = 'Sports'
    else if (genreHas(['theatre', 'theater', 'comedy', 'dance', 'film', 'exhibition', 'arts', 'art'], genreText.replace(/martial arts/gi, ' '))) category = 'Arts & Culture'
    else if (genreHas(['food', 'drink', 'wine', 'beer', 'dining'])) category = 'Food & Drink'
    else if (genreHas(['family', 'kids', 'children'])) category = 'Family'
    else if (genreHas(['business', 'conference', 'seminar', 'networking'])) category = 'Business'
  }
  if (category === 'Community' && best < 1) {
    const band = text.replace(/\bband clubs?\b/g, ' ').replace(/\brubber bands?\b/g, ' ')
    if (/\b(concert|gig|singer|dj|music|festival)\b/.test(band) || /\bband\b/.test(band)) category = 'Music'
    else if (/\b(sport|rugby|cricket|football|tennis|nrl|afl|darts?|drag[\s-]?racing)\b/.test(text)) category = 'Sports'
    else if (/\b(theatre|theater|comedy|dance|art|exhibition|gallery|opera|film)\b/.test(text)) category = 'Arts & Culture'
    else if (/\b(food|wine|beer|cocktail|dining|brunch)\b/.test(text)) category = 'Food & Drink'
    else if (/\b(melbourne cup|horse racing|racing carnival)\b/.test(text)) category = 'Sports'
    else if (/\b(kids|children|zoo|aquarium|playgroup)\b/.test(text) || (/\bfamily\b/.test(text) && !FAMILY_FALSE.test(proseText))) category = 'Family'
    else if (/\b(nightlife|night\s?club|club night|rave)\b/.test(text) || (/\bparty\b/.test(text) && !/\b(book club|probus|social club)\b/.test(text))) category = 'Nightlife'
    else if (/\b(yoga|meditation|wellness|fitness)\b/.test(text)) category = 'Wellness'
    else if (/\b(conference|workshop|seminar|business)\b/.test(text)) category = 'Business'
    else if (PERFORMER_TOUR.test(title) && !/\b(comedy|stand-?up)\b/i.test(title)) category = 'Music'
    else if (/\b(lecture|education|learning)\b/.test(text)) category = 'Education'
  }

  const blob = `${title} ${description} ${genres.join(' ')}`
  const dating = proseEvidence('Dating', title) === 'clear'
  if (dating) {
    category = 'Community'
    if (!subTags.includes('Dating')) subTags.push('Dating')
  } else if (isBusinessNetworking(blob) || (/\bnetworking\b/i.test(title) && /\bbusiness\b/i.test(title))) category = 'Business'
  else if (FAITH_COMMUNITY.test(title)) category = 'Community'
  else if (isKidsDanceClass(blob)) category = 'Family'
  else if (category === 'Music' && conflictsWithMusicIntent(title, `${description} ${genres.join(' ')}`, [...subTags, ...genres])) category = 'Arts & Culture'
  else if (category === 'Nightlife' && /\b(kids|children|playgroup|families|santa|toddler)\b/i.test(blob) && !/\b(night|club|rave)\b/i.test(title)) category = 'Family'
  if (ADULT.test(blob) && category === 'Family') category = 'Community'
  if (category === 'Business' && isBusinessNetworking(blob) && !subTags.includes('Networking')) subTags.push('Networking')
  if (category === 'Family' && isKidsDanceClass(blob) && !subTags.includes('Kids Activities')) subTags.push('Kids Activities')
  if (category === 'Family' && /\bplaygroup\b/i.test(title) && !subTags.includes('Kids Activities')) subTags.push('Kids Activities')
  if (category === 'Arts & Culture' && /\bdance class/i.test(title) && !subTags.includes('Dance')) subTags.push('Dance')
  const own = CATEGORIES.find((c) => c.name === category)?.subTags ?? []
  let filtered = [...new Set(subTags)].filter((t) => own.includes(t))
  // A source label does not override a keyword guard. Darts, "running times" and "run to the final" are not Running.
  if (filtered.includes('Running') && proseEvidence('Running', proseText) === 'misleading') {
    filtered = filtered.filter((tag) => tag !== 'Running')
  }
  return { category, subTags: dropBroadTheatre(filtered, proseText) }
}

const CONCERT_TITLE = /\b(concerts?|gigs?|recitals?|symphon(?:y|ies)|orchestras?|live music|dj sets?)\b/i

/** BNI and other business networking, including when a source tag says "arts" or "partnership". */
export function isBusinessNetworking(text: string): boolean {
  return /\bbni\b/i.test(text)
    || /\bbusiness networking\b/i.test(text)
    || /\bnetworking (breakfasts?|brunches?|lunches?|dinners?|events?|meetings?|sessions?)\b/i.test(text)
    || /\bbusiness network(?:ing)? (events?|meetings?|breakfasts?)\b/i.test(text)
}

/**
 * A dance or ballet class for children. A concert, recital, showcase or production stays a performance.
 */
export function isKidsDanceClass(text: string): boolean {
  if (/\b(concerts?|recitals?|performances?|showcases?|productions?|gigs?)\b/i.test(text)) return false
  if (!/\b(ballet|dance)\b/i.test(text)) return false
  const ages = /\b(toddlers?|kids?|children|child|babies|baby|pre-?school|preschool)\b/i.test(text)
    || /\b\d+(?:\.\d+)?\s*[-–]\s*\d+\s*(yrs|years)\b/i.test(text)
  if (/\bclasses?\b/i.test(text) && ages) return true
  return ages && /\b(ballet|dance with me)\b/i.test(text)
}

/**
 * Film, theatre, comedy and kids' dance classes are not live music, even when a source
 * genre or the Music category says they are. A title that is itself a concert stays.
 * "Theatre" inside a venue name is not enough; a Theatre/Comedy/Film tag is.
 */
export function conflictsWithMusicIntent(title: string, description = '', extra: string[] = []): boolean {
  if (CONCERT_TITLE.test(title)) return false
  const blob = `${title}\n${description}`
  if (/\b(comedy|comedian|stand-?up|standup)\b/i.test(blob)) return true
  if (/\b(screenings?|documentar(?:y|ies)|cinema)\b/i.test(blob) || /\bfilms?\b/i.test(blob)) return true
  if (/\b(stage plays?|theatre shows?|theater shows?|musicals?)\b/i.test(blob)) return true
  if (/\b(lion king|wicked|hamilton|les mis(?:e|é)rables|phantom of the opera)\b/i.test(title)) return true
  if (/\b(ballet|opera)\b/i.test(title) && !isKidsDanceClass(blob)) return true
  if (/\b(art battles?|tattoo (?:convention|expo|festival)s?)\b/i.test(blob)) return true
  if (extra.some((t) => /^(theatre|theater|comedy|film)$/i.test(t.trim()))) return true
  if (isKidsDanceClass(`${title} ${description}`)) return true
  if (/\b(dance class(?:es)?|dance lessons?|line dancing class|tango (?:class|course|fundamentals)|yoga|meditation)\b/i.test(title)
    && !/\b(concerts?|gigs?|live music|bands?|djs?|recitals?)\b/i.test(title)) return true
  return false
}

/**
 * Correct a stored category when title, description or tags show it was mistagged.
 * Returns null when the stored category should stand. Used on refresh and when reading listings.
 */
const SPORT_WORDS = /\b(rugby|nrl|afl|cricket|a-league|football|soccer|basketball|tennis|melbourne cup)\b/i

export function refineStoredCategory(ev: { title: string; description?: string | null; category: string; subTags?: string[] | null }): { category: string; subTags: string[] } | null {
  let subTags = [...(ev.subTags ?? [])]
  const text = `${ev.title} ${ev.description ?? ''} ${subTags.join(' ')}`
  let category = ev.category
  if (isBusinessNetworking(text) || /\b(investor roadshows?|shareholder)\b/i.test(text) || (/\broadshow\b/i.test(text) && /\binvestor\b/i.test(text))) category = 'Business'
  else if (category === 'Wellness' && SPORT_WORDS.test(text)) category = 'Sports'
  else if (category === 'Nightlife' && /\b(probus|book\s*clubs?|rotary|social club|melbourne cup)\b/i.test(text)) category = /\bmelbourne cup\b/i.test(text) ? 'Sports' : 'Community'
  else if (category === 'Community' && /\bmelbourne cup\b/i.test(text)) category = 'Sports'
  else if (category === 'Music' && isKidsDanceClass(text)) category = 'Family'
  else if (category === 'Music' && conflictsWithMusicIntent(ev.title, ev.description ?? '', subTags)) category = 'Arts & Culture'
  const prose = `${ev.title} ${ev.description ?? ''}`
  const photoShoot = /\b(photo\s*shoots?|photoshoots?)\b/i.test(prose)
  if (photoShoot) {
    const filmAt = subTags.indexOf('Film')
    if (filmAt >= 0) subTags.splice(filmAt, 1)
    if (category === 'Arts & Culture' && !subTags.includes('Photography')) subTags.push('Photography')
  }
  if (/\bcontiki\b/i.test(ev.title) && !/\b(film|screening|cinema|movie)\b/i.test(ev.title)) {
    const filmAt = subTags.indexOf('Film')
    if (filmAt >= 0) subTags.splice(filmAt, 1)
    if (category === 'Arts & Culture') category = 'Community'
  }
  if (proseEvidence('Dating', ev.title) === 'clear') {
    category = 'Community'
    subTags = ['Dating']
  }
  const cleaned = cleanupStoredTags({ title: ev.title, description: ev.description, category, subTags })
  category = cleaned.category
  subTags = cleaned.subTags
  const own = CATEGORIES.find((c) => c.name === category)?.subTags ?? []
  const next = subTags.filter((t) => own.includes(t))
  const changedTags = next.join('|') !== [...(ev.subTags ?? [])].filter((tag) => own.includes(tag)).join('|')
  if (category === ev.category && !changedTags && next.join('|') === [...(ev.subTags ?? [])].join('|')) return null
  if (category === 'Business' && isBusinessNetworking(`${ev.title} ${ev.description ?? ''}`) && own.includes('Networking') && !next.includes('Networking')) next.push('Networking')
  if (category === 'Family' && isKidsDanceClass(`${ev.title} ${ev.description ?? ''}`) && own.includes('Kids Activities') && !next.includes('Kids Activities')) next.push('Kids Activities')
  if (category === 'Arts & Culture') {
    if (/\b(comedy|comedian|stand-?up|standup)\b/i.test(text) && own.includes('Comedy') && !next.includes('Comedy')) next.push('Comedy')
    if (!photoShoot && /\b(screenings?|documentar(?:y|ies)|cinema|films?)\b/i.test(prose) && own.includes('Film') && !next.includes('Film')) next.push('Film')
    if (/\b(plays?|musicals?|dramas?|theatre shows?|theater shows?|stage plays?)\b/i.test(text) && own.includes('Theatre') && !next.includes('Theatre')) next.push('Theatre')
  }
  return { category, subTags: next }
}

type ListingPlace = {
  title: string
  description?: string | null
  category: string
  subTags?: string[] | null
  venueName?: string | null
  venueAddress?: string | null
  suburb?: string | null
  city?: string | null
}

/** Category, suburb and venue as they should be shown and filtered. Idempotent. */
export function presentListing<T extends ListingPlace>(ev: T): T {
  const city = ev.city ?? ''
  const refined = refineStoredCategory({ title: ev.title, description: ev.description, category: ev.category, subTags: ev.subTags })
  const suburb = reconcileSuburb(ev.suburb, ev.venueName ?? '', ev.venueAddress, city)
  const venueName = tidyVenueName(ev.venueName, ev.venueAddress, city)
  return { ...ev, ...(refined ?? {}), suburb, venueName }
}

export function checkLGBTI(title: string, description: string, genres: string[] = []): boolean {
  const folded = foldSearchText(`${title} ${description}`)
  return lgbtiFromSources(folded, '', genres.map((genre) => foldSearchText(genre)))
}

export { retagLgbti }

function cleanupStoredTags(ev: { title: string; description?: string | null; category: string; subTags: string[] }): { category: string; subTags: string[] } {
  const text = listingText(ev.title, ev.description)
  let subTags = ev.subTags.filter((tag) => proseEvidence(tag, text) !== 'misleading')
  subTags = dropBroadTheatre(subTags, text)
  let category = ev.category
  const droppedRunning = ev.subTags.includes('Running') && !subTags.includes('Running')
  const sportTags = new Set(CATEGORIES.find((cat) => cat.name === 'Sports')?.subTags ?? [])
  if (droppedRunning && category === 'Sports' && !sportSignal(text) && !subTags.some((tag) => sportTags.has(tag))) {
    category = classifyCategory(ev.title, ev.description ?? '', []).category
  }
  const own = new Set(CATEGORIES.find((cat) => cat.name === category)?.subTags ?? [])
  for (const tag of own) {
    if (proseEvidence(tag, text) === 'clear' && !subTags.includes(tag)) subTags.push(tag)
  }
  if (category !== ev.category) subTags = subTags.filter((tag) => own.has(tag))
  return { category, subTags: [...new Set(subTags)] }
}

export function checkFree(priceStr: string | null | undefined): boolean {
  return readPrice(priceStr).isFree
}

/** Category names the product actually lists, in a stable order, with junk dropped. */
export function knownCategories(input: unknown): string[] {
  const names = new Set(CATEGORIES.map((c) => c.name))
  const list = Array.isArray(input) ? input : typeof input === 'string' && input ? [input] : []
  const out: string[] = []
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    const name = raw.trim()
    if (names.has(name) && !out.includes(name)) out.push(name)
  }
  return out
}

/** Multi-select category chips. A single pick keeps `category` so older filters still match; sub-tags only apply to that one type. */
export function withCategories<T extends { category?: string; categories?: string[]; subTag?: string }>(f: T, categories: string[]): T {
  const next = knownCategories(categories)
  const single = next.length === 1 ? next[0] : ''
  const prev = knownCategories(f.categories?.length ? f.categories : f.category ? [f.category] : [])
  const keepSub = next.length === 1 && prev.length === 1 && prev[0] === next[0]
  return { ...f, categories: next, category: single, subTag: keepSub ? (f.subTag ?? '') : '' }
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
  // CBD is a precinct, not the fallback for every Sydney address. Postcode 2000 or a CBD landmark.
  // "George St" alone is not enough — that name shows up outside the CBD.
  if (/\b2000\b/.test(address)) return 'CBD'
  if (/\b(cbd|town hall|martin place|wynyard|pitt street mall|hyde park)\b/.test(text)) return 'CBD'
  return null
}

const CBD_EVIDENCE = /\b(cbd|town hall|martin place|wynyard|pitt street mall|hyde park)\b|\b2000\b/i

/**
 * Suburb to store. A parsed suburb wins. Stored "CBD" is kept only when the address
 * actually supports the CBD; otherwise it is cleared so CBD is not a dump bucket.
 * A specific stored suburb is left alone when the address does not name a better one.
 */
function suburbNamedInText(text: string, city: string): string | null {
  const areas = areasForCity(city).filter((a) => !/^cbd$/i.test(a)).sort((a, b) => b.length - a.length)
  for (const area of areas) {
    const re = new RegExp(`\\b${area.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\b(?!\\s+(?:st|street|rd|road|ave|avenue|hwy|pde|parade|ln|lane|dr|drive|tce|terrace|pl|place|way|cct|cres|blvd)\\b)`, 'i')
    if (re.test(text)) return area
  }
  return null
}

export function reconcileSuburb(stored: string | null | undefined, venueName: string, address: string | null | undefined, city: string): string | null {
  const addr = address ?? ''
  const named = suburbNamedInText(`${venueName} ${addr}`, city)
  const next = named ?? (city === 'Sydney' ? guessSuburb(venueName, addr) : suburbFromAddress(addr))
  if (next && !/^cbd$/i.test(next)) return next
  if (next) return next
  const cur = (stored ?? '').trim()
  if (!cur) return null
  if (/^cbd$/i.test(cur) && !CBD_EVIDENCE.test(`${venueName} ${addr}`)) return null
  if (city && cur.toLowerCase() === city.toLowerCase()) return null
  return cur
}

const CITY_AREAS: Record<string, string[]> = {
  Melbourne: ['CBD', 'Carlton', 'Parkville', 'Fitzroy', 'Collingwood', 'Richmond', 'Brunswick', 'Northcote', 'Southbank', 'Docklands', 'South Melbourne', 'Port Melbourne', 'St Kilda', 'South Yarra', 'Prahran', 'Windsor', 'Footscray', 'Hawthorn', 'Brighton', 'Williamstown'],
  Brisbane: ['CBD', 'South Bank', 'Fortitude Valley', 'West End', 'South Brisbane', 'New Farm', 'Kangaroo Point', 'Spring Hill', 'Paddington', 'Woolloongabba'],
  'Gold Coast': ['Surfers Paradise', 'Broadbeach', 'Southport', 'Main Beach', 'Burleigh Heads', 'Coolangatta', 'Mermaid Beach'],
  Perth: ['CBD', 'Northbridge', 'Fremantle', 'Subiaco', 'Leederville', 'Mount Lawley', 'Victoria Park', 'Scarborough'],
  Adelaide: ['CBD', 'North Adelaide', 'Glenelg', 'Norwood', 'Hindley Street', 'Port Adelaide'],
  Canberra: ['Civic', 'Braddon', 'Kingston', 'Manuka', 'Belconnen', 'Woden'],
  Newcastle: ['CBD', 'Hamilton', 'Cooks Hill', 'The Junction', 'Merewether', 'Darby Street'],
  Wollongong: ['CBD', 'North Wollongong', 'Fairy Meadow', 'Keiraville', 'Figtree', 'Port Kembla', 'Dapto', 'Thirroul'],
  Hobart: ['CBD', 'Salamanca', 'Battery Point', 'North Hobart', 'Sandy Bay'],
  Darwin: ['CBD', 'Stuart Park', 'Parap', 'Fannie Bay', 'Nightcliff'],
}

/** Area choices for the filter drawer. Sydney has its own list; other cities are not offered Sydney suburbs. */
export function areasForCity(city: string): string[] {
  if (city === 'Sydney') return SYDNEY_SUBURBS
  return CITY_AREAS[city] ?? []
}

requireEveryCity('area filters', ['Sydney', ...Object.keys(CITY_AREAS)])
