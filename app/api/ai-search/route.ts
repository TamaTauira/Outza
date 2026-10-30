import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { sydneyToday } from '@/lib/event-store'
import { addDays, sydneyNow, toMinutes } from '@/lib/board'
import { CATEGORIES, conflictsWithMusicIntent, presentListing } from '@/lib/categories'
import { CITY_NAMES } from '@/lib/cities'
import { interpretQuery, keywordRelaxAllowed, type AiFilters } from '@/lib/ai-search-parse'
import { nearestCity } from '@/lib/travel'
import { completeJson, llmConfigured } from '@/lib/llm'

export const dynamic = 'force-dynamic'
export type { AiFilters }

const RESULTS = 8
const CAT_NAMES = CATEGORIES.map((c) => c.name)

function weekend(today: string): [string, string] {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
  if (dow === 0) return [today, today]
  if (dow === 6) return [today, addDays(today, 1)]
  return [addDays(today, 6 - dow), addDays(today, 7 - dow)]
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

const clean = (s: unknown, n = 40) => (typeof s === 'string' ? s.replace(/[^\p{L}\p{N} '&-]/gu, '').trim().slice(0, n) : '')

async function aiParse(q: string, today: string, city: string) {
  if (!llmConfigured()) return null
  const dow = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
  const system = `You turn an event-search request into JSON filters for an Australian events site. Today is ${dow} ${today}${city ? ` and the user is browsing ${city}` : ''}.
Return ONLY JSON: {"dateFrom":"YYYY-MM-DD","dateTo":"YYYY-MM-DD","category":one of ${JSON.stringify(CAT_NAMES)} or "","isFree":bool,"maxPrice":number|null,"lgbtiq":bool,"timeOfDay":"morning"|"afternoon"|"evening"|"any","suburb":string,"city":one of ${JSON.stringify(CITY_NAMES)} or "","keywords":[up to 3 short search words such as a genre, artist, venue or activity]}.
Categories and their sub-types: ${CATEGORIES.map((c) => `${c.name} (${c.subTags.join(', ')})`).join('; ')}. Pick the category whose sub-types contain what the user asked for (e.g. comedy = Arts & Culture, markets = Community).
Rules: "this weekend" = the current or coming Saturday and Sunday (if today is Saturday, it is today and tomorrow); "tonight" = today with evening; no date mentioned = today to 13 days ahead. A named year (2027) is 1 January through 31 December of that year. A named month and year (January 2027) is that whole month. Words like "upcoming" do not replace a named year. If the user names a city (${CITY_NAMES.join(', ')}), set "city" to that exact name. Set timeOfDay only if the user mentions a time of day. Only set suburb if a suburb/area is named. Do not invent anything the user did not ask for. Keywords must come from the request, must not repeat the category name, the year, or the city, and leave out generic words (event, things, fun, upcoming).`
  try {
    return await completeJson({
      messages: [{ role: 'system', content: system }, { role: 'user', content: q }],
      temperature: 0,
      maxOutputTokens: 300,
      timeoutMs: 12000,
    })
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
    const filters = applyHints(interpretQuery(q, today, parsed), hints, today)
    const lat = Number(body?.lat)
    const lng = Number(body?.lng)
    let searchCity = filters.city || city
    if (filters.nearMe && !filters.city) {
      const located = Number.isFinite(lat) && Number.isFinite(lng) ? nearestCity(lat, lng) : null
      if (!located) {
        return NextResponse.json({ filters, ai: !!parsed, relaxed: false, total: 0, results: [], needsLocation: true })
      }
      searchCity = located
      filters.city = located
    }
    const now = sydneyNow()

    const narrowed: Prisma.EventWhereInput[] = [
      ...(filters.isFree ? [{ OR: [{ isFree: true }, { price: { contains: 'free', mode: 'insensitive' as const } }, { priceMin: { lte: 0 } }] }] : []),
      ...(filters.paidOnly ? [{ NOT: { OR: [{ price: { contains: 'free', mode: 'insensitive' as const } }, { priceMin: { lte: 0 } }] } }] : []),
      ...(filters.suburb ? [{ OR: [{ suburb: { contains: filters.suburb, mode: 'insensitive' as const } }, { venueAddress: { contains: filters.suburb, mode: 'insensitive' as const } }, { venueName: { contains: filters.suburb, mode: 'insensitive' as const } }] }] : []),
    ]
    const base: Prisma.EventWhereInput = {
      date: { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`), lte: new Date(`${filters.dateTo}T00:00:00.000Z`) },
      duplicateOfId: null,
      status: { not: 'CANCELLED' },
      ...(searchCity ? { city: searchCity } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.paidOnly ? { isFree: false } : {}),
      ...(filters.lgbtiq ? { isLGBTI: true } : {}),
      ...(filters.subTag ? { subTags: { has: filters.subTag } } : {}),
      AND: [...narrowed, { deletedAt: null }, { OR: [{ approvalState: null }, { approvalState: 'APPROVED' }] }],
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
      id: true, title: true, description: true, date: true, time: true, venueName: true, venueAddress: true, suburb: true, city: true, category: true, subTags: true,
      isFree: true, price: true, priceMin: true, views: true, _count: { select: { savedBy: true, attendees: true } },
    } as const
    const musicIntent = filters.category === 'Music' || /\b(live music|gigs?|concerts?)\b/i.test(q)
    const focusMusic = <T extends { title: string; description?: string | null; category: string; subTags?: string[] | null }>(list: T[]) => {
      if (!musicIntent) return list
      return list.filter((e) => e.category === 'Music' && !conflictsWithMusicIntent(e.title, e.description ?? '', e.subTags ?? []))
    }

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

    let rows = focusMusic((await run({ AND: [base, kw] })).map((e) => presentListing(e)))
    let relaxed = false
    if (!rows.length && filters.keywords.length && filters.category && !musicIntent) {
      // The user's words matter more than a guessed category: try them across every category first.
      // A live-music ask does not drop the Music category — that is how film and comedy leak in.
      const { category: _omit, ...noCategory } = base
      rows = focusMusic((await run({ AND: [noCategory, kw] })).map((e) => presentListing(e)))
      if (rows.length) filters.category = ''
    }
    if (!rows.length && keywordRelaxAllowed(filters) && !musicIntent) {
      rows = focusMusic((await run(base)).map((e) => presentListing(e)))
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
