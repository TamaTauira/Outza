import { JOB_CONNECTION_LIMIT } from '@/lib/db-url'
import { prisma } from '@/lib/prisma'
import { sydneyToday } from '@/lib/event-store'
import { remainingBudgetMs, yieldIfBudget } from '@/lib/source-budget'
import { coordsNoticeKind, missingCoordsNotice, type CoordNoticeKind } from '@/lib/listing-venue'
import { nearStartAction, nearStartHideAllowed, readSourceStatus, statusFetch, NEAR_START_HIDE_CAP_PER_SOURCE } from '@/lib/source-status'
import { softHideEvent } from '@/lib/retirement'
import { recoverMissingVenueCoordinates } from '@/lib/venue-coords'
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
/** Source re-reads per pass. Each is a real fetch; the cap plus the budget check keep the pass inside its budget. */
const NEAR_START_RECHECK_CAP = 10
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
 * Missing coordinates are filled from the original listing before a notice is raised.
 * The scheduled refresh is what updates last-checked.
 */
export async function runVerificationPass(now = new Date(), changedAfter?: Date | null) {
  if (yieldIfBudget('verification')) return { normalized: 0, flagged: 0, checks: 0 }
  const today = sydneyToday()
  const horizon = new Date(today.getTime() + 21 * 86400000)
  const rows = await prisma.event.findMany({
    where: { date: { gte: today, lte: horizon }, duplicateOfId: null, deletedAt: null, ...(changedAfter ? { updatedAt: { gt: changedAfter } } : {}) },
    orderBy: { date: 'asc' },
    take: 400,
    select: {
      id: true, title: true, date: true, endDate: true, time: true, endTime: true, city: true,
      venueName: true, venueAddress: true, suburb: true, latitude: true, longitude: true, status: true,
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
  const flagKey = (action: string, eventId: string, detail: string) =>
    action === 'MISSING_COORDS' ? `${action}:${eventId}` : `${action}:${eventId}:${detail.slice(0, 40)}`
  const seen = new Set(open.map((row) => flagKey(row.action, row.eventId ?? '', row.detail ?? '')))
  const flags: Flag[] = []
  const push = (flag: Flag) => {
    const key = flagKey(flag.action, flag.eventId, flag.detail)
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

  const missingIds = rows.filter((row) => row.latitude == null || row.longitude == null).map((row) => row.id)
  const coordLimit = remainingBudgetMs(90_000) < 15_000 ? 8 : 60
  const coords = coordLimit
    ? await recoverMissingVenueCoordinates({ limit: coordLimit, extraIds: missingIds })
    : { patches: new Map(), outcomes: new Map<string, CoordNoticeKind | 'fixed'>(), fixed: 0 }
  for (const row of rows) {
    const patch = coords.patches.get(row.id)
    if (!patch) continue
    row.venueName = patch.venueName
    row.venueAddress = patch.venueAddress
    row.latitude = patch.latitude
    row.longitude = patch.longitude
  }

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
    if (row.latitude == null && row.longitude == null && openCount('MISSING_COORDS') - coords.fixed < 40) {
      const kind: CoordNoticeKind | null = coordsNoticeKind(coords.outcomes.get(row.id))
      if (kind) {
        push({
          eventId: row.id,
          action: 'MISSING_COORDS',
          detail: missingCoordsNotice(row.title, kind),
        })
      }
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
      // A due listing is re-read at its source, not just flagged. Only a
      // definitive answer acts: gone, ended or cancelled soft-hides through
      // the retirement mechanism (it restores if the source lists the night
      // again); live restamps the last check; anything less keeps the old
      // flag-only behaviour. Rechecks are capped and budget-guarded so a slow
      // source can never eat the pass.
      const outcomes: { eventId: string; kind: string; outcome: string; detail: string }[] = []
      const heldAudits: { source: string; detail: string }[] = []
      const hidesBySource = new Map<string, number>()
      let rechecks = 0
      for (const row of fresh) {
        if (rechecks < NEAR_START_RECHECK_CAP && remainingBudgetMs(90_000) > 15_000) {
          rechecks++
          const status = await readSourceStatus(row, statusFetch, {
            ticketmasterKey: process.env.TICKETMASTER_API_KEY?.trim() || null,
          }).catch(() => 'unknown' as const)
          const action = nearStartAction(status)
          if (action === 'hide' && !nearStartHideAllowed(hidesBySource, row.source)) {
            // The per-source recheck cap is spent: this pass has already
            // hidden the cap's worth of one source's listings on recheck
            // evidence alone. A systematically wrong reader must not keep
            // going — flag for an admin instead of hiding.
            const sourceKey = row.source ?? 'unknown'
            if (!heldAudits.some((held) => held.source === sourceKey)) {
              heldAudits.push({
                source: sourceKey,
                detail: `${sourceKey}: the near-start recheck reached its per-source hide cap (${NEAR_START_HIDE_CAP_PER_SOURCE} in one pass) and further definitive negatives from this source were flagged instead of hidden. Check the source reader before trusting more of its verdicts.`,
              })
            }
            outcomes.push({
              eventId: row.id,
              kind: 'NEAR_START',
              outcome: 'flag',
              detail: `Rechecked at the source inside 36 hours of start: the source reports it ${status}, but this pass already hid ${NEAR_START_HIDE_CAP_PER_SOURCE} listings from this source on recheck evidence, so this one was flagged for an admin instead of hidden.`,
            })
            continue
          }
          if (action === 'hide') {
            hidesBySource.set(row.source ?? '', (hidesBySource.get(row.source ?? '') ?? 0) + 1)
            await softHideEvent(
              row.id,
              `Near-start recheck: the source (${row.source}) reports this occurrence ${status} inside 36 hours of its start. Soft-hidden by the retirement mechanism; it restores if the source lists it again.`,
              now,
            )
            outcomes.push({
              eventId: row.id,
              kind: 'NEAR_START',
              outcome: 'flag',
              detail: `Rechecked at the source inside 36 hours of start: the source reports it ${status}. Hidden from public listings until a source lists it again. This is not a guarantee.`,
            })
            continue
          }
          if (action === 'verified') {
            await prisma.$executeRaw`UPDATE "Event" SET "lastVerifiedAt" = ${now} WHERE "id" = ${row.id}`
            outcomes.push({
              eventId: row.id,
              kind: 'NEAR_START',
              outcome: 'ok',
              detail: 'Rechecked at the source inside 36 hours of start: still listed.',
            })
            continue
          }
        }
        outcomes.push({
          eventId: row.id,
          kind: 'NEAR_START',
          outcome: 'due',
          detail: 'Starts within 36 hours and the last check is older than 12 hours. The next feed refresh updates it. This is not a guarantee.',
        })
      }
      await prisma.verificationCheck.createMany({ data: outcomes })
      checks = outcomes.length
      for (const held of heldAudits) {
        const existing = await prisma.qualityAudit.findFirst({
          where: { action: 'SOURCE_RETIREMENT_HELD', status: 'OPEN', detail: { startsWith: `${held.source}:` } },
          select: { id: true },
        })
        if (!existing) {
          await prisma.qualityAudit.create({
            data: { eventId: null, action: 'SOURCE_RETIREMENT_HELD', status: 'OPEN', detail: held.detail },
          })
        }
      }
    }
  }

  const touched = rows.slice(0, WRITE_CAP)
  // This pass never creates SourceRecords. A record minted here would be
  // stamped seenAt=now by the schema default with no feed sighting behind
  // it, and retirement reads seenAt as "the feed last listed this event" —
  // a phantom sighting that would keep a vanished listing looking freshly
  // seen forever. Ingest creates records when a feed actually lists an
  // event; this pass only maintains sourceUrl/changed on records that
  // already exist.
  const existingRecords = await prisma.sourceRecord.findMany({
    where: { eventId: { in: touched.map((row) => row.id) } },
    select: { id: true, eventId: true, source: true },
  })
  const existingRecordId = new Map(existingRecords.map((rec) => [`${rec.eventId}|${rec.source}`, rec.id]))
  await inBatches(touched, async (row) => {
    if (!row.source) return
    const recordId = existingRecordId.get(`${row.id}|${row.source}`)
    if (!recordId) return
    const changed = !row.sources.includes(row.source)
    await prisma.sourceRecord.update({
      where: { id: recordId },
      data: { sourceUrl: row.sourceUrl, changed },
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
