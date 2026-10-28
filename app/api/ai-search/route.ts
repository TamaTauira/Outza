import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { sydneyToday } from '@/lib/event-store'
import { addDays, sydneyNow, toMinutes } from '@/lib/board'
import { CATEGORIES } from '@/lib/categories'
import { CITY_NAMES } from '@/lib/cities'

export const dynamic = 'force-dynamic'

const MODEL = 'gpt-5.4-mini'
const RESULTS = 8
const MAX_DAYS = 60
const CAT_NAMES = CATEGORIES.map((c) => c.name)
const TIMES = ['morning', 'afternoon', 'evening', 'any'] as const
type TimeOfDay = (typeof TIMES)[number]

export interface AiFilters {
  dateFrom: string; dateTo: string; category: string; isFree: boolean; maxPrice: number | null
  lgbtiq: boolean; timeOfDay: TimeOfDay; suburb: string; keywords: string[]; soon: boolean
}

/** Quick-question picks from the search bar. They override whatever the text implies. */
function applyHints(f: AiFilters, h: any, today: string) {
  if (h?.when === 'soon') { f.dateFrom = f.dateTo = today; f.timeOfDay = 'any'; f.soon = true }
  else if (h?.when === 'tonight') { f.dateFrom = f.dateTo = today; f.timeOfDay = 'evening' }
  else if (h?.when === 'weekend') { [f.dateFrom, f.dateTo] = weekend(today); f.timeOfDay = 'any' }
  if (h?.budget === 'free') { f.isFree = true; f.maxPrice = null }
  else if (h?.budget === '30' || h?.budget === '75') { f.isFree = false; f.maxPrice = Number(h.budget) }
  if (CAT_NAMES.includes(h?.category)) f.category = h.category
  const area = clean(h?.area)
  if (area) f.suburb = area
  return f
}

const GENERIC = new Set(['live', 'music', 'live music', 'event', 'events', 'things', 'fun', 'stuff', 'show', 'shows', 'activities'])
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const clean = (s: unknown, n = 40) => (typeof s === 'string' ? s.replace(/[^\p{L}\p{N} '&-]/gu, '').trim().slice(0, n) : '')

function weekend(today: string): [string, string] {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
  if (dow === 0) return [today, today]
  if (dow === 6) return [today, addDays(today, 1)]
  return [addDays(today, 6 - dow), addDays(today, 7 - dow)]
}

/** Validates whatever the model (or the fallback) produced into safe, bounded filters. */
function normalise(raw: any, today: string): AiFilters {
  let from = DAY_RE.test(raw?.dateFrom) ? raw.dateFrom : today
  let to = DAY_RE.test(raw?.dateTo) ? raw.dateTo : addDays(from, 13)
  if (from < today) from = today
  if (to < from) to = from
  if (to > addDays(today, MAX_DAYS)) to = addDays(today, MAX_DAYS)
  const keywords = (Array.isArray(raw?.keywords) ? raw.keywords : []).map((k: unknown) => clean(k, 30)).filter((k: string) => k.length > 1 && !GENERIC.has(k.toLowerCase())).slice(0, 4)
  const maxPrice = Number(raw?.maxPrice)
  return {
    dateFrom: from, dateTo: to,
    category: CAT_NAMES.includes(raw?.category) ? raw.category : '',
    isFree: raw?.isFree === true,
    maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? Math.min(maxPrice, 2000) : null,
    lgbtiq: raw?.lgbtiq === true,
    timeOfDay: TIMES.includes(raw?.timeOfDay) ? raw.timeOfDay : 'any',
    suburb: clean(raw?.suburb),
    keywords,
    soon: false,
  }
}

/** Keyword parser used when the AI is unavailable. */
function fallbackParse(q: string, today: string) {
  const s = q.toLowerCase()
  const out: any = { keywords: [] as string[] }
  if (/\btonight\b/.test(s)) { out.dateFrom = out.dateTo = today; out.timeOfDay = 'evening' }
  else if (/\btoday\b/.test(s)) out.dateFrom = out.dateTo = today
  else if (/\btomorrow\b/.test(s)) out.dateFrom = out.dateTo = addDays(today, 1)
  else if (/\bweekend\b/.test(s)) [out.dateFrom, out.dateTo] = weekend(today)
  if (/\bfree\b/.test(s)) out.isFree = true
  if (/\b(lgbt|queer|gay|pride)/.test(s)) out.lgbtiq = true
  const m = s.match(/(?:under|below|less than)\s*\$?(\d+)/)
  if (m) out.maxPrice = Number(m[1])
  const cat = CATEGORIES.find((c) => s.includes(c.name.toLowerCase().split(' ')[0]) || c.subTags.some((t) => s.includes(t.toLowerCase())))
  if (cat) out.category = cat.name
  if (/\b(gig|band|concert|live music)\b/.test(s)) out.category = 'Music'
  const stop = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'what', 'whats', 'events', 'event', 'near', 'tonight', 'today', 'tomorrow', 'weekend', 'free', 'under', 'something', 'things', 'thing', 'some', 'show', 'find', 'me', 'on', 'in', 'to', 'do', 'a', 'an', 'of', 'at', 'live', 'music'])
  out.keywords = s.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !stop.has(w) && !/^\d+$/.test(w) && !(cat && cat.name.toLowerCase().includes(w))).slice(0, 3)
  return out
}

async function aiParse(q: string, today: string, city: string) {
  const key = process.env.ABACUSAI_API_KEY
  if (!key) return null
  const dow = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
  const system = `You turn an event-search request into JSON filters for an Australian events site. Today is ${dow} ${today}${city ? ` and the user is browsing ${city}` : ''}.
Return ONLY JSON: {"dateFrom":"YYYY-MM-DD","dateTo":"YYYY-MM-DD","category":one of ${JSON.stringify(CAT_NAMES)} or "","isFree":bool,"maxPrice":number|null,"lgbtiq":bool,"timeOfDay":"morning"|"afternoon"|"evening"|"any","suburb":string,"keywords":[up to 3 short search words such as a genre, artist, venue or activity]}.
Categories and their sub-types: ${CATEGORIES.map((c) => `${c.name} (${c.subTags.join(', ')})`).join('; ')}. Pick the category whose sub-types contain what the user asked for (e.g. comedy = Arts & Culture, markets = Community).
Rules: "this weekend" = the current or coming Saturday and Sunday (if today is Saturday, it is today and tomorrow); "tonight" = today with evening; no date mentioned = today to 13 days ahead. Set timeOfDay only if the user mentions a time of day. Only set suburb if a suburb/area is named. Do not invent anything the user did not ask for. Keywords must come from the request, must not repeat the category name ("live music" with Music needs no keyword), and leave out generic words (event, things, fun).`
  try {
    const res = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 300, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: q }] }),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`)
    const j = await res.json()
    return JSON.parse(j?.choices?.[0]?.message?.content ?? '{}')
  } catch (e: any) {
    console.error('ai-search parse failed', e?.message)
    return null
  }
}

function lowestPrice(isFree: boolean, priceMin: number | null, price: string | null): number | null {
  if (isFree) return 0
  if (priceMin != null) return priceMin
  const nums = (price?.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
  return nums.length ? Math.min(...nums) : null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const q = String(body?.q ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
    const city = CITY_NAMES.includes(body?.city) ? body.city : ''
    const hints = body?.hints && typeof body.hints === 'object' ? body.hints : null
    const hasHints = !!hints && ['when', 'budget', 'category', 'area'].some((k) => typeof hints[k] === 'string' && hints[k].trim())
    if (q.length < 2 && !hasHints) return NextResponse.json({ error: 'Tell us what you feel like doing' }, { status: 400 })

    const today = sydneyToday().toISOString().slice(0, 10)
    const parsed = q.length >= 2 ? await aiParse(q, today, city) : null
    // Relative dates are resolved in code so "this weekend" or "tonight" can never drift.
    const fb: any = q.length >= 2 ? fallbackParse(q, today) : {}
    const merged = parsed && fb.dateFrom && !/\bnext\b/i.test(q) ? { ...parsed, dateFrom: fb.dateFrom, dateTo: fb.dateTo, timeOfDay: fb.timeOfDay ?? parsed.timeOfDay } : parsed
    const filters = applyHints(normalise(merged ?? fb, today), hints, today)
    const now = sydneyNow()

    const base: Prisma.EventWhereInput = {
      date: { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`), lte: new Date(`${filters.dateTo}T00:00:00.000Z`) },
      duplicateOfId: null,
      status: { not: 'CANCELLED' },
      ...(city ? { city } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.isFree ? { isFree: true } : {}),
      ...(filters.lgbtiq ? { isLGBTI: true } : {}),
      ...(filters.suburb ? { OR: [{ suburb: { contains: filters.suburb, mode: 'insensitive' } }, { venueAddress: { contains: filters.suburb, mode: 'insensitive' } }] } : {}),
    }
    const kw: Prisma.EventWhereInput = filters.keywords.length
      ? { AND: [{ OR: filters.keywords.flatMap((k) => [
          { title: { contains: k, mode: 'insensitive' as const } },
          { description: { contains: k, mode: 'insensitive' as const } },
          { venueName: { contains: k, mode: 'insensitive' as const } },
          { subTags: { has: k[0].toUpperCase() + k.slice(1) } },
        ]) }] }
      : {}
    const select = {
      id: true, title: true, date: true, time: true, venueName: true, suburb: true, city: true, category: true,
      isFree: true, price: true, priceMin: true, views: true, _count: { select: { savedBy: true, attendees: true } },
    } as const

    const run = async (where: Prisma.EventWhereInput) => {
      const rows = await prisma.event.findMany({ where, select, take: 400, orderBy: [{ date: 'asc' }, { time: 'asc' }] })
      return rows.filter((e) => {
        const mins = toMinutes(e.time)
        if (e.date.toISOString().slice(0, 10) === today && mins !== null && mins < now.minutes - 60) return false
        if (filters.soon && (mins === null || mins < now.minutes - 30 || mins > now.minutes + 180)) return false
        if (filters.timeOfDay === 'morning' && (mins === null || mins >= 12 * 60)) return false
        if (filters.timeOfDay === 'afternoon' && (mins === null || mins < 12 * 60 || mins >= 17 * 60)) return false
        if (filters.timeOfDay === 'evening' && (mins === null || mins < 17 * 60)) return false
        if (filters.maxPrice != null) {
          const p = lowestPrice(e.isFree, e.priceMin, e.price)
          if (p === null || p > filters.maxPrice) return false
        }
        return true
      })
    }

    let rows = await run({ AND: [base, kw] })
    let relaxed = false
    if (!rows.length && filters.keywords.length && filters.category) {
      // The user's words matter more than a guessed category: try them across every category first.
      const { category: _omit, ...noCategory } = base
      rows = await run({ AND: [noCategory, kw] })
      if (rows.length) filters.category = ''
    }
    if (!rows.length && filters.keywords.length) {
      rows = await run(base)
      relaxed = rows.length > 0
    }

    // Soonest first, with a nudge for events people have saved or marked as going.
    const ranked = rows
      .map((e, i) => ({ e, s: -i * 0.15 + (e._count.savedBy + e._count.attendees) * 0.5 + Math.min(e.views, 200) / 100 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, RESULTS)
      .map(({ e }) => e)
      .sort((a, b) => +a.date - +b.date || (toMinutes(a.time) ?? 0) - (toMinutes(b.time) ?? 0))

    return NextResponse.json({
      filters, ai: !!parsed, relaxed, total: rows.length,
      results: ranked.map((e) => ({
        id: e.id, title: e.title, date: e.date.toISOString().slice(0, 10), time: e.time, venueName: e.venueName,
        suburb: e.suburb, city: e.city, category: e.category, isFree: e.isFree, price: e.price,
      })),
    })
  } catch (e: any) {
    console.error('ai-search error', e?.message)
    return NextResponse.json({ error: 'Search is unavailable right now. Please try again.' }, { status: 500 })
  }
}
