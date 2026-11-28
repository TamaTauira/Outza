import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { sydneyToday } from '@/lib/event-store'
import { sydneyNow, toMinutes } from '@/lib/board'
import { CATEGORIES, conflictsWithMusicIntent, presentListing } from '@/lib/categories'
import { CITY_NAMES } from '@/lib/cities'
import { interpretQuery, keywordRelaxAllowed, type AiFilters } from '@/lib/ai-search-parse'
import { askCandidateTake, askDateBounds, askTextWhere, priceWhere, shouldFilterCategory } from '@/lib/ai-search-query'
import { applyHints } from '@/lib/search-hints'
import { rankAskRows, relaxedKeywords, ASK_LIMIT } from '@/lib/ai-search-rank'
import { isPaidListing } from '@/lib/quality'
import { nearestCity } from '@/lib/travel'
import { completeJson, llmConfigured } from '@/lib/llm'

export const dynamic = 'force-dynamic'
export type { AiFilters }

const CAT_NAMES = CATEGORIES.map((c) => c.name)

function clockMinute(mins: number): string {
  const clamped = Math.max(0, Math.min(mins, 23 * 60 + 59))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

const clean = (s: unknown, n = 40) => (typeof s === 'string' ? s.replace(/[^\p{L}\p{N} '&-]/gu, '').trim().slice(0, n) : '')

async function aiParse(q: string, today: string, city: string) {
  if (!llmConfigured()) return null
  const dow = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
  const system = `You are Ask VibePeep, the friend who knows what's on. Reply with JSON filters only. Never chat, and never invent a vibe the person did not ask for.
You turn an event-search request into JSON filters for an Australian events site. Today is ${dow} ${today}${city ? ` and the user is browsing ${city}` : ''}.
Return ONLY JSON: {"dateFrom":"YYYY-MM-DD","dateTo":"YYYY-MM-DD","category":one of ${JSON.stringify(CAT_NAMES)} or "","isFree":bool,"maxPrice":number|null,"lgbtiq":bool,"timeOfDay":"morning"|"afternoon"|"evening"|"any","suburb":string,"city":one of ${JSON.stringify(CITY_NAMES)} or "","keywords":[up to 3 short search words such as a genre, artist, venue or activity]}.
Categories and their sub-types: ${CATEGORIES.map((c) => `${c.name} (${c.subTags.join(', ')})`).join('; ')}. Pick a category only when the request names one. Keep the topic words (market, comedy, opera, hip hop) in keywords. Do not turn "markets" into category Community.
Rules: "this weekend" = the current or coming Saturday and Sunday (if today is Saturday, it is today and tomorrow); "this week" = today through the next 6 days, not a fortnight; "tonight" = today with evening; no date mentioned = today to 13 days ahead. For LGBTIQ+, queer, gay, pride or lesbian requests set lgbtiq true and do not also require the literal word as a keyword. A named year (2027) is 1 January through 31 December of that year. A named month and year (January 2027) is that whole month. Words like "upcoming" do not replace a named year. If the user names a city (${CITY_NAMES.join(', ')}), set "city" to that exact name. Set timeOfDay only if the user mentions a time of day. Only set suburb if a suburb/area is named. Do not invent anything the user did not ask for. Keywords must come from the request, must not repeat the category name, the year, or the city, and leave out generic words (event, things, fun, upcoming).`
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
    const chipPrice = Number(body?.maxPrice)
    const chipTag = clean(body?.subTag, 40)
    if (q.length < 2 && !hasHints && !(chipPrice > 0)) return NextResponse.json({ error: 'Tell us what you feel like doing' }, { status: 400 })

    const today = sydneyToday().toISOString().slice(0, 10)
    const parsed = q.length >= 2 ? await aiParse(q, today, city) : null
    const filters = applyHints(interpretQuery(q, today, parsed), hints, today)
    if (Number.isFinite(chipPrice) && chipPrice > 0) filters.maxPrice = Math.min(chipPrice, 2000)
    if (chipTag) filters.subTag = chipTag
    const uncoveredPlace = filters.uncoveredPlace ?? ''
    const pastIntent = filters.pastIntent === true
    const lat = Number(body?.lat)
    const lng = Number(body?.lng)
    let searchCity = filters.city || city
    if (filters.nearMe && !filters.city) {
      const located = Number.isFinite(lat) && Number.isFinite(lng) ? nearestCity(lat, lng) : null
      if (!located) {
        return NextResponse.json({ filters, ai: !!parsed, relaxed: false, total: 0, results: [], needsLocation: true, uncoveredPlace, pastIntent, degraded: false, noSignal: false })
      }
      searchCity = located
      filters.city = located
    }

    // No-signal guard: the query had characters, but the parse found
    // nothing in them — no keywords, category, suburb, named city, price,
    // flag or non-default dates (an emoji-only ask is the shape that
    // lands here). Running the base query anyway would present the city
    // pool as a successful search; gibberish with no other signal stays
    // an empty result, as the drop-keywords fallback already assumes.
    // Picks from the UI (hints, chips) are signal too — they came from
    // the person's taps, not from the unparseable text.
    const defaultToDate = new Date(`${today}T00:00:00Z`)
    defaultToDate.setUTCDate(defaultToDate.getUTCDate() + 13)
    const hasSignal = !!(
      filters.keywords.length || filters.category || filters.suburb || filters.city ||
      filters.isFree || filters.paidOnly || filters.maxPrice != null || filters.lgbtiq ||
      filters.timeOfDay !== 'any' || filters.soon || filters.nearMe ||
      filters.dateFrom !== today || filters.dateTo !== defaultToDate.toISOString().slice(0, 10) ||
      uncoveredPlace || pastIntent || hasHints || chipPrice > 0 || chipTag
    )
    if (q.length >= 2 && !hasSignal) {
      const { noteAsk } = await import('@/lib/ops/ask-stats')
      await noteAsk(false)
      return NextResponse.json({ filters, ai: !!parsed, relaxed: false, total: 0, results: [], noSignal: true, uncoveredPlace, pastIntent, degraded: false })
    }

    const now = sydneyNow()

    const price = priceWhere(filters)
    const narrowed: Prisma.EventWhereInput[] = [
      ...(price ? [price] : []),
      ...(filters.paidOnly ? [{ NOT: { OR: [{ price: { contains: 'free', mode: 'insensitive' as const } }, { priceMin: { lte: 0 } }] } }] : []),
      ...(filters.suburb ? [{ OR: [{ suburb: { contains: filters.suburb, mode: 'insensitive' as const } }, { venueAddress: { contains: filters.suburb, mode: 'insensitive' as const } }, { venueName: { contains: filters.suburb, mode: 'insensitive' as const } }] }] : []),
    ]
    const musicIntent = filters.category === 'Music' || /\b(live music|gigs?|concerts?)\b/i.test(q)
    const base: Prisma.EventWhereInput = {
      date: askDateBounds(filters.dateFrom, filters.dateTo),
      duplicateOfId: null,
      status: { not: 'CANCELLED' },
      ...(searchCity ? { city: searchCity } : {}),
      ...(shouldFilterCategory(filters, q) ? { category: filters.category } : {}),
      // Only a chip-picked tag is a hard filter. A tag the parser inferred from the
      // person's words boosts in rankAskRows instead — stored tags are too patchy
      // for an inferred guess to gate on.
      ...(chipTag ? { subTags: { has: chipTag } } : {}),
      ...(filters.timeOfDay === 'morning' ? { time: { gte: '05:00', lt: '12:00' } } : {}),
      ...(filters.timeOfDay === 'afternoon' ? { time: { gte: '12:00', lt: '17:00' } } : {}),
      ...(filters.timeOfDay === 'evening' ? { time: { gte: '17:00' } } : {}),
      ...(filters.soon ? { time: { gte: clockMinute(now.minutes - 30), lte: clockMinute(now.minutes + 180) } } : {}),
      ...(filters.paidOnly ? { isFree: false } : {}),
      AND: [...narrowed, { deletedAt: null }, { OR: [{ approvalState: null }, { approvalState: 'APPROVED' }] }],
    }
    const select = {
      id: true, title: true, description: true, date: true, time: true, venueName: true, venueAddress: true, suburb: true, city: true, category: true, subTags: true,
      isLGBTI: true, isFree: true, price: true, priceMin: true, views: true, _count: { select: { savedBy: true, attendees: true } },
    } as const
    const focusMusic = <T extends { title: string; description?: string | null; category: string; subTags?: string[] | null }>(list: T[]) => {
      if (!musicIntent) return list
      return list.filter((e) => e.category === 'Music' && !conflictsWithMusicIntent(e.title, e.description ?? '', e.subTags ?? []))
    }

    // A timed-out or failed query is not a genuine no-match: run()
    // still returns [], but the response says it was degraded so the
    // client can own the failure instead of reporting "nothing matches".
    let degraded = false
    const run = async (where: Prisma.EventWhereInput) => {
      const rows = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('statement_timeout', '4000', true)`
        return tx.event.findMany({ where, select, take: askCandidateTake(filters.dateFrom, filters.dateTo), orderBy: [{ date: 'asc' }, { time: 'asc' }] })
      }, { timeout: 6000 }).catch((err) => {
        degraded = true
        console.error('ai-search query timed out or failed', err instanceof Error ? err.message : err)
        return [] as Awaited<ReturnType<typeof prisma.event.findMany>>
      })
      return rows.filter((e) => {
        const mins = toMinutes(e.time)
        if (e.date.toISOString().slice(0, 10) === today && mins !== null && mins < now.minutes - 60) return false
        if (filters.soon && (mins === null || mins < now.minutes - 30 || mins > now.minutes + 180)) return false
        if (filters.timeOfDay === 'morning' && (mins === null || mins >= 12 * 60)) return false
        if (filters.timeOfDay === 'afternoon' && (mins === null || mins < 12 * 60 || mins >= 17 * 60)) return false
        if (filters.timeOfDay === 'evening' && (mins === null || mins < 17 * 60)) return false
        if (filters.isFree && isPaidListing(e)) return false
        if (filters.maxPrice != null) {
          const p = lowestPrice(e.isFree, e.priceMin, e.price)
          if (p === null || p > filters.maxPrice) return false
        }
        return true
      })
    }

    const load = async (words: string[]) => {
      const text = askTextWhere(words, filters.lgbtiq)
      const where = Object.keys(text).length ? { AND: [base, text] } : base
      return focusMusic((await run(where)).map((e) => presentListing(e)))
    }
    let rows = await load(filters.keywords)
    let relaxed = false
    const broader = relaxedKeywords(filters.keywords)
    // Music queries relax too: the strict AND is exactly what zeroes gig and
    // concert asks ("classical concerts and theatre" must be allowed to fall
    // back to "classical" alone). focusMusic still narrows the relaxed rows.
    if (rows.length < 3 && broader) {
      const extra = await load(broader)
      const seen = new Set(rows.map((row) => row.id))
      rows = [...rows, ...extra.filter((row) => !seen.has(row.id))]
      relaxed = extra.length > 0
    }
    if (!rows.length && keywordRelaxAllowed(filters) && !filters.keywords.length && !musicIntent) {
      rows = focusMusic((await run(base)).map((e) => presentListing(e)))
      relaxed = rows.length > 0
    }

    const matched = rankAskRows(rows, { ...filters, city: searchCity }, Math.max(rows.length, 1))
    const { noteAsk } = await import('@/lib/ops/ask-stats')
    await noteAsk(!(degraded && matched.length === 0))

    return NextResponse.json({
      filters, ai: !!parsed, relaxed, total: matched.length, uncoveredPlace, pastIntent, degraded, noSignal: false,
      results: matched.slice(0, ASK_LIMIT).map((e) => ({
        id: e.id, title: e.title, date: e.date.toISOString().slice(0, 10), time: e.time, venueName: e.venueName,
        suburb: e.suburb, city: e.city, category: e.category, isFree: e.isFree, price: e.price,
      })),
    })
  } catch (e: any) {
    console.error('ai-search error', e?.message)
    const { noteAsk } = await import('@/lib/ops/ask-stats')
    await noteAsk(false)
    return NextResponse.json({ error: 'Ask’s having a moment. Give it another go.' }, { status: 500 })
  }
}
