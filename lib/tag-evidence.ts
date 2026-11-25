/**
 * Sub-tags and the LGBTIQ+ flag need clear evidence.
 * A source genre label counts. Explicit wording counts.
 * A loose keyword does not: "rock the boat", "running times", "the country's",
 * "opera house", or the broad "Arts & Theatre" segment.
 */

export type TagEvidence = 'clear' | 'misleading' | 'absent'

const POPUP = /pop[- ]up/gi

export function listingText(title: string, description?: string | null): string {
  return `${title} ${description ?? ''}`.replace(POPUP, 'popup')
}

function tagPattern(tag: string): RegExp {
  const escaped = tag.toLowerCase().replace(/[.*+?^${}()|[\]\\/&]/g, '\\$&').replace(/\\ /g, '\\s+')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i')
}

function phrase(text: string, re: RegExp): TagEvidence {
  return re.test(text) ? 'clear' : 'absent'
}

export function proseEvidence(tag: string, text: string): TagEvidence {
  const body = text.replace(POPUP, 'popup')
  switch (tag) {
    case 'Rock': return rockEvidence(body)
    case 'Pop': return popEvidence(body)
    case 'Country': return countryEvidence(body)
    case 'Metal': return metalEvidence(body)
    case 'Running': return runningEvidence(body)
    case 'Opera': return operaEvidence(body)
    case 'Market':
    case 'Markets': return marketEvidence(body)
    case 'Party': return partyEvidence(body)
    case 'Talk': return talkEvidence(body)
    case 'Course': return courseEvidence(body)
    case 'Tour': return tourEvidence(body)
    case 'Health': return healthEvidence(body)
    case 'Dating': return datingEvidence(body)
    case 'Social': return socialEvidence(body)
    case 'Electronic/EDM': return electronicEvidence(body)
    case 'Folk/Acoustic': return folkEvidence(body)
    case 'Hip Hop': return phrase(body, /\bhip[\s-]?hop\b/i)
    case 'R&B': return phrase(body, /\br\s*&\s*b\b|\brnb\b|\brhythm and blues\b/i)
    case 'World Music': return phrase(body, /\bworld music\b/i)
    case 'Theatre': return theatreEvidence(body)
    default: return phrase(body, tagPattern(tag))
  }
}

function rockEvidence(text: string): TagEvidence {
  const stripped = text
    .replace(/\brock the boat\b/gi, ' ')
    .replace(/\brock up\b/gi, ' ')
    .replace(/\brock climbing\b/gi, ' ')
    .replace(/\brock pools?\b/gi, ' ')
    .replace(/\brock walls?\b/gi, ' ')
    .replace(/\brock solid\b/gi, ' ')
    .replace(/\bbetween a rock\b/gi, ' ')
    .replace(/\brock and a hard place\b/gi, ' ')
  if (/\brock\b/i.test(stripped)) return 'clear'
  if (/\brock\b/i.test(text)) return 'misleading'
  return 'absent'
}

function popEvidence(text: string): TagEvidence {
  if (/\b(k[\s-]?pop|pop[\s-]?punk|synth[\s-]?pop|dance[\s-]?pop|indie[\s-]?pop|electro[\s-]?pop|power[\s-]?pop|art[\s-]?pop|dream[\s-]?pop|bedroom[\s-]?pop|pop music|pop stars?|pop concerts?)\b/i.test(text)) return 'clear'
  const stripped = text
    .replace(/\bpopcorn\b/gi, ' ')
    .replace(/\bpop in\b/gi, ' ')
    .replace(/\bpop culture\b/gi, ' ')
    .replace(/\bpop of colour\b/gi, ' ')
    .replace(/\bpop of color\b/gi, ' ')
    .replace(/\bsoda pop\b/gi, ' ')
  if (/\bpop\b/i.test(stripped)) return 'clear'
  if (/\bpop\b/i.test(text)) return 'misleading'
  return 'absent'
}

function countryEvidence(text: string): TagEvidence {
  if (/\b(country(?:\s*(?:&|and)\s*western|\s+(?:music|duo|artist|artists|band|star|songs?|singer|singers|show|night))|turn up the country|honky[\s-]?tonk)\b/i.test(text)) return 'clear'
  if (/\bcountry'?s\b|\bwith country\b|\bon country\b|\bin the country\b|\bcountry towns?\b|\bcontaminated country\b/i.test(text)) return 'misleading'
  return 'absent'
}

function metalEvidence(text: string): TagEvidence {
  if (/\b(heavy metal|death metal|black metal|thrash(?: metal)?|metalcore|doom metal|power metal|folk metal|nu[\s-]?metal|metal bands?|metal music)\b/i.test(text)) return 'clear'
  if (/\b(metal detectors?|precious metals?|scrap metal|metalwork|metal bars?)\b/i.test(text)) return 'misleading'
  if (/\bmetal\b/i.test(text)) return 'clear'
  return 'absent'
}

function runningEvidence(text: string): TagEvidence {
  // Darts is its own sport. "Run to the semi-finals" and "nine-dart" are not a footrace.
  if (/\b(darts?|oche)\b/i.test(text)) return 'misleading'
  const activity = /\b(fun[\s-]?runs?|park[\s-]?runs?|trail runs?|night runs?|colou?r runs?|beach runs?|charity runs?|run(?:ning)? (?:clubs?|crews?|groups?|sessions?)|half[\s-]?marathons?|marathons?|ultra[\s-]?marathons?|\d+\s?k(?:m)?\s(?:run|race)|\d+k\b|jog(?:ging)?|runners|running (?:races?|events?|festivals?|track|coach(?:ing)?)|go(?:es|ing)? running|trail running|road running|run\/walk|walk(?:\s*(?:&|and|or)\s*)run)\b/i
  const nounRun = /\brun\b/i
  const verb = /\b(?:are|is|be|been|was|were|we're|currently|now|keep|kept)\s+running\b|\brunning (?:a|an|the|this|our|free|\d+|weekly|monthly|since|for|from|until|through(?:out)?|every|on|in|at|late|times|regularly|workshops?|sessions? on|programs?|events?\b(?! like))/i
  const boilerplate = /\brunning times\b|\brunning stitch(?:es)?\b|\bup and running\b|\brunning late\b|\brunning regularly\b/i
  // A campaign or a rules line, not a running event.
  const notARace = /\brun to the\b|\b(?:unforgettable|famous|career(?:-defining)?|sensational|winning|title) run\b|\brunning to (?:either|a|an|the)\b/i
  // One pass down a drag strip is "a run". A fun run at the same event still counts.
  if (/\b(drag[\s-]?racing|dragway)\b/i.test(text)) {
    const rest = text.replace(/\ba run\b/gi, ' ').replace(/\brunning to\b/gi, ' ').replace(notARace, ' ')
    if (!activity.test(rest)) return 'misleading'
  }
  if (verb.test(text) || boilerplate.test(text) || notARace.test(text)) {
    const rest = text
      .replace(verb, ' ')
      .replace(/\brunning times\b/gi, ' ')
      .replace(/\brunning stitch(?:es)?\b/gi, ' ')
      .replace(/\bup and running\b/gi, ' ')
      .replace(/\brunning late\b/gi, ' ')
      .replace(/\brunning regularly\b/gi, ' ')
      .replace(notARace, ' ')
    if (activity.test(rest)) return 'clear'
    return 'misleading'
  }
  if (activity.test(text) || nounRun.test(text)) return 'clear'
  return 'absent'
}

function courseEvidence(text: string): TagEvidence {
  const stripped = text
    .replace(/\bof course\b/gi, ' ')
    .replace(/\bgolf courses?\b/gi, ' ')
    .replace(/\bmain courses?\b/gi, ' ')
    .replace(/\brace ?courses?\b/gi, ' ')
    .replace(/\bobstacle courses?\b/gi, ' ')
    .replace(/\b\d+[\s-]?courses?\b/gi, ' ')
    .replace(/\b(?:two|three|four|five|multi)[\s-]courses?\b/gi, ' ')
    .replace(/\bcourses? (?:meal|menu|dinner|lunch)\b/gi, ' ')
    .replace(/\bin due course\b/gi, ' ')
    .replace(/\b(?:over|during) the course of\b/gi, ' ')
    .replace(/\bcourses? of (?:action|treatment)\b/gi, ' ')
  if (/\b(short courses?|\d+[\s-]?(?:week|day|session) courses?|courses?)\b/i.test(stripped)) return 'clear'
  if (/\bcourse/i.test(text)) return 'misleading'
  return 'absent'
}

function tourEvidence(text: string): TagEvidence {
  if (/\b(?:world|australian|aus|national|album|farewell|reunion|anniversary|headline|debut|ep|nz|oz nz|20\d\d|comedy|stand-?up|summer|winter|spring|autumn|east coast) tour\b|\bon tour\b|\btour(?:ing)? (?:australia|nationally)\b/i.test(text)) return 'misleading'
  if (/\b(?:walking|guided|garden|heritage|history|historic(?:al)?|ghost|food|wine|brewery|distillery|bus|boat|kayak|bike|museum|gallery|behind[\s-]the[\s-]scenes|architecture|art|bushwalk|nature|night|precinct|site|farm|campus|harbour|river|whale|eco|cultural|aboriginal|indigenous|self[\s-]guided|curator|stadium|house|tram|rail) tours?\b/i.test(text)) return 'clear'
  return 'absent'
}

function healthEvidence(text: string): TagEvidence {
  const stripped = text
    .replace(/\bhealth and safety\b/gi, ' ')
    .replace(/\b(?:NSW|Queensland) Health\b/gi, ' ')
    .replace(/\bpublic health\b/gi, ' ')
    .replace(/\bhealth (?:fund|insurance|department|care workers?|professionals? only)\b/gi, ' ')
  const terms = ['yoga', 'meditation', 'wellbeing', 'mental health', 'fitness', 'nutrition', 'mindfulness']
  const found = terms.filter((term) => new RegExp(`\\b${term}\\b`, 'i').test(text)).length
  if (found >= 2) return 'clear'
  if (/\bhealth\b/i.test(stripped) && text.length < 140) return 'clear'
  if (/\bhealth\b/i.test(text)) return 'misleading'
  return 'absent'
}

function datingEvidence(text: string): TagEvidence {
  if (/\b(singles tour|dating apps? (?:talk|panel)|dating show)\b/i.test(text)) return 'misleading'
  if (/\bsingles\b/i.test(text) && /\b(tennis|badminton|squash|pickleball|golf)\b/i.test(text)) return 'misleading'
  if (/\b(speed[\s-]?dating|slow dating|weed dating|singles? (?:mixer|night|event|party|social|dinner|drinks|walk|mingle)s?|dating (?:night|event|club|experience)s?|matchmaking|for singles)\b/i.test(text)) return 'clear'
  return 'absent'
}

function socialEvidence(text: string): TagEvidence {
  if (/\b(social club|meet[\s-]?up|newcomers|make new friends|mates|social group)\b/i.test(text)) return 'clear'
  return 'absent'
}

function operaEvidence(text: string): TagEvidence {
  const rest = text.replace(/\bopera houses?\b/gi, ' ')
  if (/\boperas?\b/i.test(rest)) return 'clear'
  if (/\bopera houses?\b/i.test(text)) return 'misleading'
  return 'absent'
}

function marketEvidence(text: string): TagEvidence {
  const rest = text
    .replace(/\bstock markets?\b/gi, ' ')
    .replace(/\bjob markets?\b/gi, ' ')
    .replace(/\bhousing markets?\b/gi, ' ')
    .replace(/\bon the market\b/gi, ' ')
    .replace(/\bmarket share\b/gi, ' ')
    .replace(/\bmarket value\b/gi, ' ')
    .replace(/\bsupermarkets?\b/gi, ' ')
  if (/\bmarkets?\b/i.test(rest)) return 'clear'
  if (/\bmarkets?\b/i.test(text)) return 'misleading'
  return 'absent'
}

function partyEvidence(text: string): TagEvidence {
  const rest = text
    .replace(/\bpolitical part(?:y|ies)\b/gi, ' ')
    .replace(/\bthird part(?:y|ies)\b/gi, ' ')
    .replace(/\bsearch part(?:y|ies)\b/gi, ' ')
    .replace(/\bparty of \d+\b/gi, ' ')
    .replace(/\bhost your (?:party|event)\b/gi, ' ')
    .replace(/\bparty hire\b/gi, ' ')
    .replace(/\bbirthday part(?:y|ies) (?:packages?|bookings?)\b/gi, ' ')
  if (/\bpart(?:y|ies)\b/i.test(rest)) return 'clear'
  if (/\bpart(?:y|ies)\b/i.test(text)) return 'misleading'
  return 'absent'
}

function talkEvidence(text: string): TagEvidence {
  const rest = text
    .replace(/\btalk(?:ing|ed|s)? about\b/gi, ' ')
    .replace(/\btalking\b/gi, ' ')
    .replace(/\bsmall talk\b/gi, ' ')
    .replace(/\btalk to\b/gi, ' ')
  if (/\btalks?\b/i.test(rest)) return 'clear'
  if (/\btalk/i.test(text)) return 'misleading'
  return 'absent'
}

function electronicEvidence(text: string): TagEvidence {
  if (/\b(edm|electronic dance|electronic music|techno|trance|drum and bass|drum & bass|dnb)\b/i.test(text)) return 'clear'
  return 'absent'
}

function folkEvidence(text: string): TagEvidence {
  if (/\b(folk music|folk songs?|acoustic sets?|acoustic gigs?|folk\/acoustic)\b/i.test(text)) return 'clear'
  return 'absent'
}

function theatreEvidence(text: string): TagEvidence {
  if (/\b(plays?|musicals?|dramas?|theatre shows?|theater shows?|stage plays?)\b/i.test(text)) return 'clear'
  return 'absent'
}

/** Comedy, dance, opera, film or circus already names the show. "Arts & Theatre" does not. */
const SPECIFIC_ARTS = ['Comedy', 'Dance', 'Opera', 'Film', 'Circus']

export function dropBroadTheatre(tags: string[], text: string): string[] {
  if (!tags.includes('Theatre')) return tags
  if (/\b(plays?|musicals?|dramas?|theatre shows?|theater shows?|stage plays?)\b/i.test(text)) return tags
  if (SPECIFIC_ARTS.some((tag) => tags.includes(tag))) return tags.filter((tag) => tag !== 'Theatre')
  return tags
}

const BROAD: { re: RegExp; category: string | null }[] = [
  { re: /^(live music|concerts?|music)$/i, category: 'Music' },
  { re: /^(arts?\s*(?:&|and)\s*theatres?|performing arts|arts?)$/i, category: 'Arts & Culture' },
  { re: /^(sports?|athletics?)$/i, category: 'Sports' },
  { re: /^(food\s*(?:&|and)\s*drink|food|drink|dining)$/i, category: 'Food & Drink' },
  { re: /^(family|kids|children)$/i, category: 'Family' },
  { re: /^(business|conferences?|networking)$/i, category: 'Business' },
  { re: /^(nightlife|night\s?clubs?)$/i, category: 'Nightlife' },
  { re: /^(wellness|health(?:\s*(?:&|and)\s*wellness)?)$/i, category: 'Wellness' },
  { re: /^(education)$/i, category: 'Education' },
  { re: /^(community|miscellaneous|undefined|other|general)$/i, category: null },
]

const ALIASES: { re: RegExp; tag: string; category: string }[] = [
  { re: /\brock\b/i, tag: 'Rock', category: 'Music' },
  { re: /\bpop\b/i, tag: 'Pop', category: 'Music' },
  { re: /\bhip[\s-]?hop\b|\brap\b/i, tag: 'Hip Hop', category: 'Music' },
  { re: /\br\s*&\s*b\b|\brnb\b|\brhythm and blues\b/i, tag: 'R&B', category: 'Music' },
  { re: /\b(edm|electronic|techno|trance|dnb|drum\s*(?:and|&)\s*bass)\b/i, tag: 'Electronic/EDM', category: 'Music' },
  { re: /\bfolk\b|\bacoustic\b/i, tag: 'Folk/Acoustic', category: 'Music' },
  { re: /\bcountry\b/i, tag: 'Country', category: 'Music' },
  { re: /\bmetal\b/i, tag: 'Metal', category: 'Music' },
  { re: /\bindie\b/i, tag: 'Indie', category: 'Music' },
  { re: /\bjazz\b/i, tag: 'Jazz', category: 'Music' },
  { re: /\b(classical|orchestral)\b/i, tag: 'Classical', category: 'Music' },
  { re: /\bgospel\b/i, tag: 'Gospel', category: 'Music' },
  { re: /\bworld music\b/i, tag: 'World Music', category: 'Music' },
  { re: /\b(comedy|stand-?up)\b/i, tag: 'Comedy', category: 'Arts & Culture' },
  { re: /\b(theatres?|theaters?|musicals?)\b/i, tag: 'Theatre', category: 'Arts & Culture' },
  { re: /\b(dance|ballet)\b/i, tag: 'Dance', category: 'Arts & Culture' },
  { re: /\b(films?|cinema|movies?)\b/i, tag: 'Film', category: 'Arts & Culture' },
  { re: /\boperas?\b/i, tag: 'Opera', category: 'Arts & Culture' },
  { re: /\bexhibitions?\b/i, tag: 'Exhibition', category: 'Arts & Culture' },
  { re: /\bvisual arts?\b/i, tag: 'Visual Arts', category: 'Arts & Culture' },
  { re: /\bphotography\b/i, tag: 'Photography', category: 'Arts & Culture' },
  { re: /\bcircus\b/i, tag: 'Circus', category: 'Arts & Culture' },
  { re: /\bspoken word\b/i, tag: 'Spoken Word', category: 'Arts & Culture' },
  { re: /\b(football|soccer)\b/i, tag: 'Football', category: 'Sports' },
  { re: /\brugby\b/i, tag: 'Rugby', category: 'Sports' },
  { re: /\bcricket\b/i, tag: 'Cricket', category: 'Sports' },
  { re: /\btennis\b/i, tag: 'Tennis', category: 'Sports' },
  { re: /\bbasketball\b/i, tag: 'Basketball', category: 'Sports' },
  { re: /\bswimming\b/i, tag: 'Swimming', category: 'Sports' },
  { re: /\bcycling\b/i, tag: 'Cycling', category: 'Sports' },
  { re: /\brunning\b/i, tag: 'Running', category: 'Sports' },
  { re: /\bmartial arts\b/i, tag: 'Martial Arts', category: 'Sports' },
  { re: /\bmotorsport\b/i, tag: 'Motorsport', category: 'Sports' },
  { re: /\bwine tasting\b/i, tag: 'Wine Tasting', category: 'Food & Drink' },
  { re: /\bbeer festival\b/i, tag: 'Beer Festival', category: 'Food & Drink' },
  { re: /\bfood fair\b/i, tag: 'Food Fair', category: 'Food & Drink' },
  { re: /\bcocktail\b/i, tag: 'Cocktail', category: 'Food & Drink' },
  { re: /\bdining experience\b/i, tag: 'Dining Experience', category: 'Food & Drink' },
  { re: /\bmarkets?\b/i, tag: 'Market', category: 'Food & Drink' },
  { re: /\byoga\b/i, tag: 'Yoga', category: 'Wellness' },
  { re: /\bmeditation\b/i, tag: 'Meditation', category: 'Wellness' },
  { re: /\bfitness\b/i, tag: 'Fitness', category: 'Wellness' },
  { re: /\bhealth\b/i, tag: 'Health', category: 'Wellness' },
  { re: /\bmindfulness\b/i, tag: 'Mindfulness', category: 'Wellness' },
]

/** Map one source label. Broad segments set a category and do not invent a sub-tag. */
export function tagsFromGenreLabels(genres: string[]): { category: string | null; subTags: string[] } {
  let category: string | null = null
  const subTags: string[] = []
  for (const raw of genres) {
    const label = String(raw ?? '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!label || label.length > 80) continue
    const broad = BROAD.find((row) => row.re.test(label))
    if (broad) {
      if (broad.category) category = broad.category
      continue
    }
    const hits = ALIASES.filter((alias) => alias.re.test(label))
    const musical = hits.some((alias) => alias.category === 'Music')
    for (const alias of hits) {
      if (musical && alias.tag === 'Dance') continue
      if (!subTags.includes(alias.tag)) subTags.push(alias.tag)
      category = alias.category
    }
  }
  return { category, subTags }
}

export function lgbtiEvidence(text: string): TagEvidence {
  const body = text.replace(POPUP, 'popup')
  if (/\b(lgbtiq?a?(?:\+)?|lgbtq?a?(?:\+)?|queer|lesbian|gays?|drag queens?|drag shows?|mardi[\s-]?gras|transgender|transsexual|gender[\s-]?diverse|non[-\s]?binary)\b/i.test(body)) return 'clear'
  if (/\bpride\b/i.test(body)) {
    if (/\b(pride (?:fest(?:ival)?s?|fairs?|formals?|marches?|parades?|part(?:y|ies)|weeks?|months?|centres?|centers?|glee)|(?:sydney|brisbane|melbourne|adelaide|perth|hobart|canberra|gold coast|midsumma)\s+pride)\b/i.test(body)) return 'clear'
    return 'misleading'
  }
  if (/\brainbow\b/i.test(body)) {
    if (/\brainbow (?:flags?|communit(?:y|ies))\b/i.test(body)) return 'clear'
    return 'misleading'
  }
  if (/\btrans\b/i.test(body)) {
    if (/\btrans[\s-]?tasman\b/i.test(body)) return 'misleading'
    return 'clear'
  }
  return 'absent'
}

/** A one-word source label such as Pride is a category, not a sentence. */
export function lgbtiFromSources(title: string, description: string, genres: string[] = []): boolean {
  if (lgbtiEvidence(`${title} ${description}`) === 'clear') return true
  return genres.some((genre) => {
    const label = genre.trim()
    if (!label || label.length > 80) return false
    if (/^(pride|rainbow|trans|queer|lgbt\w*)$/i.test(label)) return true
    return lgbtiEvidence(label) === 'clear'
  })
}

/** Keep a stored flag that came from a source label. Drop one that only matched a loose word. */
export function retagLgbti(stored: boolean, title: string, description?: string | null): boolean {
  const evidence = lgbtiEvidence(listingText(title, description))
  if (evidence === 'clear') return true
  if (evidence === 'misleading') return false
  return stored
}

export function sportSignal(text: string): boolean {
  return /\b(rugby|nrl|afl|cricket|a-league|football|soccer|basketball|tennis|melbourne cup|mma|wrestling|marathons?|parkruns?|grand prix|tip[\s-]?offs?|motorsports?|swimming|cycling|darts?|oche|drag[\s-]?racing|dragway)\b/i.test(text)
}
