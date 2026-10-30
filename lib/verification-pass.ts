import { JOB_CONNECTION_LIMIT } from '@/lib/db-url'
import { prisma } from '@/lib/prisma'
import { sydneyToday } from '@/lib/event-store'
import { yieldIfBudget } from '@/lib/source-budget'
import {
  NEAR_START_WINDOW_MS,
  dateKeyOf,
  minutesOf,
  nearStartPlan,
  repeatedSourceFailures,
  scheduleFields,
  venueHoursFit,
  venueKey,
  type ScheduleInput,
} from '@/lib/listing-window'

const FLAG_CAP = 40
const WRITE_CAP = 120
const EXCEPTION_ACTIONS = ['TIME_CONFLICT', 'MISSING_COORDS', 'SUSPECT_IMAGE', 'SOURCE_FAILURE', 'SOURCE_CHANGED', 'SOURCE_MISSING'] as const

type Flag = { eventId: string; action: string; detail: string }

async function inBatches<T>(items: T[], fn: (t: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += JOB_CONNECTION_LIMIT) {
    if (yieldIfBudget('verification')) return
    await Promise.all(items.slice(i, i + JOB_CONNECTION_LIMIT).map(fn))
  }
}

/**
 * Normalise upcoming listings and queue exception rows.
 * Idempotent: an open flag for the same listing and action is not inserted again.
 * No feed is fetched here. The scheduled refresh is what updates last-checked.
 */
export async function runVerificationPass(now = new Date()) {
  if (yieldIfBudget('verification')) return { normalized: 0, flagged: 0, checks: 0 }
  const today = sydneyToday()
  const horizon = new Date(today.getTime() + 21 * 86400000)
  const rows = await prisma.event.findMany({
    where: { date: { gte: today, lte: horizon }, duplicateOfId: null },
    orderBy: { date: 'asc' },
    take: 400,
    select: {
      id: true, title: true, date: true, endDate: true, time: true, endTime: true, city: true,
      venueName: true, venueAddress: true, latitude: true, longitude: true, status: true,
      source: true, sources: true, sourceUrl: true, ticketUrl: true, organiserUrl: true,
      isFree: true, price: true, lastVerifiedAt: true, updatedAt: true, recurrence: true,
      timezone: true, allDay: true, startsAt: true, endsAt: true, confidenceScore: true,
      imageAsset: { select: { status: true } },
    },
  })
  if (yieldIfBudget('verification')) return { normalized: 0, flagged: 0, checks: 0 }

  const open = await prisma.qualityAudit.findMany({
    where: { status: 'OPEN', action: { in: [...EXCEPTION_ACTIONS] } },
    select: { eventId: true, action: true, detail: true },
    take: 500,
  })
  const seen = new Set(open.map((row) => `${row.action}:${row.eventId ?? ''}:${row.detail?.slice(0, 40) ?? ''}`))
  const flags: Flag[] = []
  const push = (flag: Flag) => {
    const key = `${flag.action}:${flag.eventId}:${flag.detail.slice(0, 40)}`
    if (seen.has(key) || flags.length >= FLAG_CAP) return
    seen.add(key)
    flags.push(flag)
  }

  const stale = rows.filter((row) => {
    const next = scheduleFields(row, now.getTime())
    if (!row.startsAt || row.allDay !== next.allDay || row.timezone !== next.timezone) return true
    return Math.abs(row.startsAt.getTime() - (next.startsAt?.getTime() ?? 0)) > 60_000
  }).slice(0, WRITE_CAP)

  let normalized = 0
  await inBatches(stale, async (row) => {
    const next = scheduleFields(row, now.getTime())
    const key = venueKey(row.city, row.venueName)
    const venue = await prisma.venue.upsert({
      where: { key },
      create: {
        key,
        name: row.venueName.slice(0, 200),
        city: row.city,
        timezone: next.timezone,
        latitude: row.latitude,
        longitude: row.longitude,
      },
      update: {
        name: row.venueName.slice(0, 200),
        ...(row.latitude != null && row.longitude != null ? { latitude: row.latitude, longitude: row.longitude } : {}),
      },
      select: { id: true },
    })
    await prisma.event.update({
      where: { id: row.id },
      data: {
        timezone: next.timezone,
        allDay: next.allDay,
        startsAt: next.startsAt,
        endsAt: next.endsAt,
        confidenceScore: next.confidenceScore,
        venueId: venue.id,
      },
    })
    if (next.startsAt) {
      await prisma.eventOccurrence.upsert({
        where: { eventId_startsAt: { eventId: row.id, startsAt: next.startsAt } },
        create: {
          eventId: row.id,
          startsAt: next.startsAt,
          endsAt: next.endsAt,
          timezone: next.timezone,
          allDay: next.allDay,
          status: row.status,
          recurrence: row.recurrence,
        },
        update: {
          endsAt: next.endsAt,
          timezone: next.timezone,
          allDay: next.allDay,
          status: row.status,
          recurrence: row.recurrence,
        },
      })
    }
    normalized++
  })

  if (yieldIfBudget('verification')) return { normalized, flagged: 0, checks: 0 }

  const keys = [...new Set(rows.map((row) => venueKey(row.city, row.venueName)))]
  const hours = keys.length
    ? await prisma.venue.findMany({
      where: { key: { in: keys }, openTime: { not: null }, closeTime: { not: null }, hoursSource: { not: null } },
      select: { key: true, openTime: true, closeTime: true, hoursSource: true },
    })
    : []
  const hoursByKey = new Map(hours.map((row) => [row.key, row]))

  const openCount = (action: string) => open.filter((row) => row.action === action).length
  for (const row of rows) {
    if (flags.length >= FLAG_CAP) break
    const hasLink = !!(row.sourceUrl || row.ticketUrl || row.organiserUrl)
    if (!hasLink) {
      push({
        eventId: row.id,
        action: 'SOURCE_MISSING',
        detail: `${row.title}: no source, ticket or organiser link.`,
      })
    }
    if (row.source && row.sources.length && !row.sources.includes(row.source)) {
      push({
        eventId: row.id,
        action: 'SOURCE_CHANGED',
        detail: `${row.title}: primary source ${row.source} is no longer in the source list (${row.sources.join(', ')}).`,
      })
    }
    const venue = hoursByKey.get(venueKey(row.city, row.venueName))
    const fit = venueHoursFit(minutesOf(row.time), venue?.openTime, venue?.closeTime)
    if (fit === 'outside' && venue) {
      push({
        eventId: row.id,
        action: 'TIME_CONFLICT',
        detail: `${row.title}: start ${row.time} is outside ${venue.hoursSource} hours ${venue.openTime}–${venue.closeTime}. Shown as possibly available, not as a guarantee.`,
      })
    }
    const imageStatus = row.imageAsset?.status
    if (imageStatus === 'REVIEW' || imageStatus === 'LOW_RES') {
      push({
        eventId: row.id,
        action: 'SUSPECT_IMAGE',
        detail: `${row.title}: image is ${imageStatus}. The listing stays up.`,
      })
    }
    const online = /^(online|virtual|tba|tbc)$/i.test(row.venueName.trim())
    if (row.latitude == null && row.longitude == null && !online && openCount('MISSING_COORDS') < 40) {
      push({
        eventId: row.id,
        action: 'MISSING_COORDS',
        detail: `${row.title}: no venue coordinates. Left on the board. Not a guarantee either way.`,
      })
    }
  }

  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000)
  const logs = await prisma.refreshLog.findMany({
    where: { startedAt: { gte: since }, status: { startsWith: 'source:' } },
    select: { status: true, errors: true, startedAt: true },
    orderBy: { startedAt: 'desc' },
    take: 80,
  })
  for (const name of repeatedSourceFailures(logs)) {
    push({
      eventId: '',
      action: 'SOURCE_FAILURE',
      detail: `${name} failed two refreshes in a row. Listings from that source were not deleted.`,
    })
  }

  if (flags.length) {
    await prisma.qualityAudit.createMany({
      data: flags.map((flag) => ({
        eventId: flag.eventId || null,
        action: flag.action,
        detail: flag.detail,
        status: 'OPEN',
      })),
    })
  }

  let checks = 0
  const due = rows.filter((row) => {
    const start = row.startsAt ?? scheduleFields(row, now.getTime()).startsAt
    return nearStartPlan(row.lastVerifiedAt, start, now.getTime()) === 'due'
  }).slice(0, FLAG_CAP)
  if (due.length) {
    const recent = await prisma.verificationCheck.findMany({
      where: {
        eventId: { in: due.map((row) => row.id) },
        kind: 'NEAR_START',
        createdAt: { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
      },
      select: { eventId: true },
    })
    const have = new Set(recent.map((row) => row.eventId))
    const fresh = due.filter((row) => !have.has(row.id))
    if (fresh.length) {
      await prisma.verificationCheck.createMany({
        data: fresh.map((row) => ({
          eventId: row.id,
          kind: 'NEAR_START',
          outcome: 'due',
          detail: 'Starts within 36 hours and the last check is older than 12 hours. The next feed refresh updates it. This is not a guarantee.',
        })),
      })
      checks = fresh.length
    }
  }

  const touched = rows.slice(0, WRITE_CAP)
  await inBatches(touched, async (row) => {
    const missing = !(row.sourceUrl || row.ticketUrl || row.organiserUrl)
    const changed = row.source ? !row.sources.includes(row.source) : false
    await prisma.sourceRecord.upsert({
      where: { eventId_source: { eventId: row.id, source: row.source } },
      create: {
        eventId: row.id,
        source: row.source,
        sourceUrl: row.sourceUrl,
        missing,
        changed,
      },
      update: { seenAt: now, sourceUrl: row.sourceUrl, missing, changed },
    })
  })

  console.log('[verification]', { normalized, flagged: flags.length, checks })
  return { normalized, flagged: flags.length, checks }
}

/** Page-side note when a listing is close to start and stale. One row per 12 hours. No outbound fetch. */
export async function queueNearStartRecheck(ev: ScheduleInput & { id: string }, now = Date.now()) {
  const start = ev.date ? scheduleFields(ev, now).startsAt : null
  if (nearStartPlan(ev.lastVerifiedAt, start, now) !== 'due') return
  if (dateKeyOf(ev.date) && ev.duplicateOfId) return
  const recent = await prisma.verificationCheck.findFirst({
    where: { eventId: ev.id, kind: 'NEAR_START', createdAt: { gte: new Date(now - 12 * 60 * 60 * 1000) } },
    select: { id: true },
  })
  if (recent) return
  await prisma.verificationCheck.create({
    data: {
      eventId: ev.id,
      kind: 'NEAR_START',
      outcome: 'due',
      detail: `Starts within ${Math.round(NEAR_START_WINDOW_MS / 3600000)} hours and the last check is older than 12 hours. The scheduled feed refresh updates it. This is not a guarantee.`,
    },
  })
}
