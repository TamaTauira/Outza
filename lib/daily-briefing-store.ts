import { prisma } from '@/lib/db'
import { cityDef } from '@/lib/cities'
import { PUBLIC_EVENT_AND } from '@/lib/community-shared'
import { heatForEvents, missingRelation } from '@/lib/engagement-store'
import { dailyAudioPlaybackEnabled, dailyBriefingEnabled } from '@/lib/feature-flags'
import { minutesNow } from '@/lib/listing-window'
import { isUnder18 } from '@/lib/profile-shared'
import { addDaysKey, cityToday } from '@/lib/seo'
import { getSessionUser } from '@/lib/session'
import type { TasteSource } from '@/lib/newsletter/taste'
import {
  briefingHash,
  buildTranscript,
  isEdition,
  personaliseItems,
  spokenScript,
  type BriefingCandidate,
  type Edition,
} from '@/lib/daily-briefing'

const select = {
  id: true, title: true, description: true, date: true, endDate: true, time: true, endTime: true,
  venueName: true, suburb: true, city: true, category: true, subTags: true, isFree: true, isLGBTI: true,
  price: true, priceMin: true, status: true, duplicateOfId: true, lastVerifiedAt: true, updatedAt: true,
  source: true, imageUrl: true, ageRestriction: true, latitude: true, longitude: true, createdAt: true,
} as const

async function tasteFor(userId: string, city: string): Promise<TasteSource | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, preferredCategories: true, vibeProfile: true, birthYear: true, homePostcode: true },
  })
  if (!user || isUnder18(user.birthYear)) return null
  const [saved, venues] = await Promise.all([
    prisma.savedEvent.findMany({
      where: { userId },
      take: 40,
      orderBy: { createdAt: 'desc' },
      select: { event: { select: { id: true, title: true, category: true, venueName: true, suburb: true, subTags: true } } },
    }),
    prisma.venueFollow.findMany({ where: { userId }, take: 20, select: { venueName: true } }),
  ])
  return {
    name: user.name,
    city,
    homePostcode: user.homePostcode,
    preferredCategories: user.preferredCategories,
    vibe: user.vibeProfile,
    birthYear: user.birthYear,
    venueNames: venues.map((row) => row.venueName),
    saved: saved.map((row) => row.event),
  }
}

export async function loadDailyBriefing(cityName: string, editionRaw: string) {
  if (!dailyBriefingEnabled()) return { enabled: false as const }
  if (!isEdition(editionRaw)) return { enabled: true as const, error: 'Unknown edition' as const }
  const edition: Edition = editionRaw
  const city = cityDef(cityName)
  if (city.name !== cityName) return { enabled: true as const, error: 'Choose a city' as const }
  const now = new Date()
  const day = cityToday(city, now)
  const nowMinutes = minutesNow(city.name, now)
  const from = new Date(`${addDaysKey(day, -1)}T00:00:00.000Z`)
  const to = new Date(`${addDaysKey(day, 8)}T00:00:00.000Z`)
  const rows = await prisma.event.findMany({
    where: {
      city: city.name,
      duplicateOfId: null,
      deletedAt: null,
      status: { in: ['SCHEDULED', 'RESCHEDULED'] },
      AND: [...PUBLIC_EVENT_AND, { OR: [{ date: { gte: from, lt: to } }, { endDate: { gte: from } }] }],
    },
    select,
    take: 120,
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  })
  const heat = await heatForEvents(rows.map((row) => row.id), now)
  const events: BriefingCandidate[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    date: row.date.toISOString(),
    endDate: row.endDate?.toISOString() ?? null,
    time: row.time,
    endTime: row.endTime,
    venueName: row.venueName,
    suburb: row.suburb,
    city: row.city,
    category: row.category,
    subTags: row.subTags,
    isFree: row.isFree,
    isLGBTI: row.isLGBTI,
    price: row.price,
    priceMin: row.priceMin,
    status: row.status,
    duplicateOfId: row.duplicateOfId,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    source: row.source,
    imageUrl: row.imageUrl,
    ageRestriction: row.ageRestriction,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.createdAt.toISOString(),
    heat: heat.get(row.id) ?? 0,
  }))
  const transcript = buildTranscript(events, edition, city.name, day, nowMinutes, now.getTime())
  const spoken = spokenScript(transcript)
  const hash = briefingHash(transcript)
  let cached = false
  try {
    const existing = await prisma.dailyBriefing.findUnique({ where: { city_edition_day: { city: city.name, edition, day } } })
    if (!existing || existing.contentHash !== hash) {
      await prisma.dailyBriefing.upsert({
        where: { city_edition_day: { city: city.name, edition, day } },
        create: { city: city.name, edition, day, contentHash: hash, transcript, spoken, eventIds: transcript.items.map((item) => item.id), audioStatus: 'NONE', audioPath: null },
        update: { contentHash: hash, transcript, spoken, eventIds: transcript.items.map((item) => item.id), audioStatus: 'NONE', audioPath: null },
      })
    }
    cached = true
  } catch (err) {
    if (!missingRelation(err)) console.error('daily briefing cache failed', (err as Error)?.message)
  }
  const me = await getSessionUser().catch(() => null)
  const taste = me ? await tasteFor(me.id, city.name).catch(() => null) : null
  const personal = personaliseItems(transcript.items, events, taste)
  const playback = cached && dailyAudioPlaybackEnabled() && transcript.items.length > 0
  return {
    enabled: true as const,
    city: city.name,
    edition,
    day,
    intro: transcript.intro,
    items: personal.items,
    outro: transcript.outro,
    empty: transcript.empty,
    personalised: personal.personalised,
    personalNote: personal.personalised ? 'The recording is the same for everyone in this city. This list is ordered from preferences you saved.' : null,
    playback,
    audioUrl: playback ? `/api/daily/audio?city=${encodeURIComponent(city.name)}&edition=${edition}&day=${day}` : null,
  }
}
