import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { classifyHeld, scoreDuplicate } from '@/lib/ops/ai'
import { llmConfigured } from '@/lib/llm'
import { applyOpsAction, type ApplyInput } from '@/lib/ops/apply'
import { backlogApplyEnabled, decide, loadRuleConfig, readLiveSince, recentDecision } from '@/lib/ops/decide'
import { emailMatchesOrganiser, notifyTrustTeam } from '@/lib/trust'
import { duplicatePrimaryId } from '@/lib/trust-queue'
import { locateAddress } from '@/lib/geocode'
import { placeFromText } from '@/lib/venue-place'
import { pinFitsCity } from '@/lib/listing-venue'
import { fakePublicUrl } from '@/lib/listing-moderation'
import { readJobMark, writeJobCursor } from '@/lib/job-watermark'
import { yieldIfBudget } from '@/lib/source-budget'
import { markDigestItem, upsertDigestItem } from '@/lib/ops/queue'
import {
  ruleClaim,
  ruleDuplicateFlagged,
  ruleDuplicateReview,
  ruleEventReport,
  ruleExpiredHidden,
  ruleHeldEvent,
  ruleMissingCoords,
  ruleTimeConflict,
  ruleVenueProfile,
  shouldResolveExisting,
  type SourceLook,
} from '@/lib/ops/rules'
import type { RuleKey, Ruling } from '@/lib/ops/types'

const PAGE = 20
const BUDGET_MS = 45_000
const MAX_AI = 8
const MAX_GEOCODE = 2
const MAX_FETCH = 4

type Work = {
  kind: string
  rule: RuleKey
  targetType: string
  targetId: string
  createdAt: Date
  summary: string
  ruling: Ruling | null
  apply: ApplyInput
  prepare?: () => Promise<Ruling>
}

function past(date: Date, today: Date): boolean {
  return date.getTime() < today.getTime()
}

async function sourceLook(url: string | null | undefined): Promise<SourceLook> {
  if (!url) return { ok: false }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 4_000)
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow', headers: { 'user-agent': 'VibePeep listings check' } })
    if (res.status === 404 || res.status === 410) return { ok: true, missing: true }
    if (!res.ok) return { ok: false }
    const text = (await res.text()).slice(0, 50_000)
    const cancelled = /\b(cancelled|canceled)\b/i.test(text)
    const date = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] ?? null
    return { ok: true, cancelled, date, missing: false }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}

async function finish(work: Work, ruling: Ruling): Promise<'acted' | 'queued' | 'skipped'> {
  if (ruling.outcome === 'skip') return 'skipped'
  if (await recentDecision(work.targetType, work.targetId, ruling.outcome === 'act' ? ruling.action : 'digest')) {
    return 'skipped'
  }
  if (ruling.outcome === 'digest') {
    await upsertDigestItem({
      kind: work.kind,
      targetType: work.targetType,
      targetId: work.targetId,
      summary: ruling.summary,
      confidence: ruling.confidence,
      status: 'OPEN',
      payload: {
        approveAction: ruling.approveAction,
        declineAction: ruling.declineAction,
        ...work.apply,
      } as Prisma.InputJsonValue,
    })
    await decide({
      kind: work.kind,
      targetType: work.targetType,
      targetId: work.targetId,
      action: 'digest',
      reason: ruling.reason,
      confidence: ruling.confidence,
      actor: 'bot:rules',
    })
    return 'queued'
  }
  const applied = await applyOpsAction({ ...work.apply, action: ruling.action, patch: { ...work.apply.patch, ...ruling.patch } })
  await decide({
    kind: work.kind,
    targetType: work.targetType,
    targetId: work.targetId,
    action: ruling.action,
    reason: ruling.reason,
    confidence: ruling.confidence,
    actor: ruling.actor,
    before: applied.before as Prisma.InputJsonValue,
    after: applied.after as Prisma.InputJsonValue,
  })
  await markDigestItem(work.targetType, work.targetId, 'HANDLED')
  if (ruling.highRisk && work.apply.eventId) {
    const already = await recentDecision('event', work.apply.eventId, 'safety-email')
    if (!already) {
      await notifyTrustTeam(`Safety hold: ${work.summary.slice(0, 80)}`, [['Why', ruling.reason], ['Listing', work.apply.eventId]])
      await decide({
        kind: 'SAFETY_HOLD',
        targetType: 'event',
        targetId: work.apply.eventId,
        action: 'safety-email',
        reason: ruling.reason,
        confidence: ruling.confidence,
        actor: ruling.actor,
      })
    }
  }
  return 'acted'
}

/**
 * Resolves new trust items after the quality pass.
 * Rows created before the first run stay for the dry-run report.
 */
export async function runAutoResolve(now = new Date()) {
  if (yieldIfBudget('ops resolve')) return { acted: 0, queued: 0, skipped: 0, paused: true }
  const started = Date.now()
  const liveSince = await readLiveSince(now)
  const allowBacklog = backlogApplyEnabled()
  const { enabled, thresholds } = await loadRuleConfig()
  const mark = await readJobMark('opsResolve').catch(() => null)
  let phase = mark?.page ?? 0
  let afterId = mark?.sweepId || undefined
  let acted = 0
  let queued = 0
  let skipped = 0
  let aiLeft = MAX_AI
  let geoLeft = MAX_GEOCODE
  let fetchLeft = MAX_FETCH
  const today = new Date(now)
  today.setUTCHours(0, 0, 0, 0)

  const budget = () => Date.now() - started >= BUDGET_MS || yieldIfBudget('ops resolve')

  while (!budget() && phase <= 5) {
    const batch = await loadPhase(phase, afterId, liveSince, allowBacklog, enabled, thresholds, today, {
      takeAi: () => (aiLeft > 0 && llmConfigured() ? (aiLeft -= 1, true) : false),
      takeGeo: () => (geoLeft > 0 ? (geoLeft -= 1, true) : false),
      takeFetch: () => (fetchLeft > 0 ? (fetchLeft -= 1, true) : false),
    })
    if (!batch.lastId) {
      phase += 1
      afterId = undefined
      continue
    }
    for (const work of batch.items) {
      if (budget()) {
        await writeJobCursor('opsResolve', now, phase, 0, afterId ?? null).catch(() => {})
        return { acted, queued, skipped, paused: true, phase }
      }
      try {
        const ruling = work.ruling ?? (work.prepare ? await work.prepare() : null)
        if (!ruling) { skipped += 1; continue }
        const result = await finish(work, ruling)
        if (result === 'acted') acted += 1
        else if (result === 'queued') queued += 1
        else skipped += 1
      } catch (err) {
        console.error('[ops] item failed', err instanceof Error ? err.message : err)
        skipped += 1
      }
    }
    afterId = batch.lastId
    if (!batch.more) {
      phase += 1
      afterId = undefined
    }
  }
  if (phase > 5) await writeJobCursor('opsResolve', now, 0, 0, null).catch(() => {})
  else await writeJobCursor('opsResolve', now, phase, 0, afterId ?? null).catch(() => {})
  return { acted, queued, skipped, paused: phase <= 5, phase }
}

type BudgetFns = {
  takeAi: () => boolean
  takeGeo: () => boolean
  takeFetch: () => boolean
}

type Batch = { items: Work[]; lastId: string | null; more: boolean }

function pack(rows: { id: string }[], items: Work[]): Batch {
  return { items, lastId: rows.at(-1)?.id ?? null, more: rows.length === PAGE }
}

async function loadPhase(
  phase: number,
  afterId: string | undefined,
  liveSince: Date,
  allowBacklog: boolean,
  enabled: Record<RuleKey, boolean>,
  thresholds: Awaited<ReturnType<typeof loadRuleConfig>>['thresholds'],
  today: Date,
  budget: BudgetFns,
): Promise<Batch> {
  const cursor = afterId ? { id: { gt: afterId } } : {}
  if (phase === 0) return loadAudits(cursor, liveSince, allowBacklog, enabled, thresholds, today, budget)
  if (phase === 1) return loadHeld(cursor, liveSince, allowBacklog, enabled, thresholds, today, budget)
  if (phase === 2) return loadReports(cursor, liveSince, allowBacklog, enabled, thresholds, budget)
  if (phase === 3) return loadEventClaims(cursor, liveSince, allowBacklog, enabled)
  if (phase === 4) return loadVenueClaims(cursor, liveSince, allowBacklog, enabled)
  if (phase === 5) return loadVenueChanges(cursor, liveSince, allowBacklog, enabled)
  return { items: [], lastId: null, more: false }
}

async function loadAudits(
  cursor: { id?: { gt: string } },
  liveSince: Date,
  allowBacklog: boolean,
  enabled: Record<RuleKey, boolean>,
  thresholds: Awaited<ReturnType<typeof loadRuleConfig>>['thresholds'],
  today: Date,
  budget: BudgetFns,
): Promise<Batch> {
  const rows = await prisma.qualityAudit.findMany({
    where: { status: 'OPEN', ...cursor },
    orderBy: { id: 'asc' },
    take: PAGE,
    select: { id: true, action: true, detail: true, eventId: true, createdAt: true },
  })
  const out: Work[] = []
  for (const row of rows) {
    if (!shouldResolveExisting(row.createdAt, liveSince, allowBacklog)) continue
    const event = row.eventId
      ? await prisma.event.findUnique({
        where: { id: row.eventId },
        select: {
          id: true, title: true, venueName: true, venueAddress: true, suburb: true, city: true, date: true, time: true,
          latitude: true, longitude: true, ticketUrl: true, organiserUrl: true, sourceUrl: true, source: true, sources: true,
          promoterId: true, duplicateOfId: true,
          promotions: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 },
        },
      })
      : null
    const base = {
      targetType: 'quality_audit',
      targetId: row.id,
      createdAt: row.createdAt,
      apply: { auditId: row.id, eventId: row.eventId, primaryId: duplicatePrimaryId(row.detail) } as ApplyInput,
    }
    if (row.action === 'EXPIRED_HIDDEN' && enabled.expired_hidden) {
      out.push({ ...base, kind: 'EXPIRED_HIDDEN', rule: 'expired_hidden', summary: row.detail ?? 'Expired listing', ruling: ruleExpiredHidden({ past: !event || past(event.date, today) }) })
    } else if (row.action === 'MISSING_COORDS' && enabled.missing_coords && event) {
      out.push({ ...base, kind: 'MISSING_COORDS', rule: 'missing_coords', summary: event.title, ruling: null, prepare: () => prepareCoords(row.id, event, budget) })
    } else if (row.action === 'TIME_CONFLICT' && enabled.time_conflict) {
      const hours = /outside .* hours/i.test(row.detail ?? '')
      out.push({
        ...base,
        kind: 'TIME_CONFLICT',
        rule: 'time_conflict',
        summary: event?.title ?? 'Time conflict',
        ruling: ruleTimeConflict({
          kind: hours ? 'hours' : 'sources',
          ticketUrl: event?.ticketUrl,
          organiserUrl: event?.organiserUrl,
          sources: await sourceFreshness(event?.id, event?.sources ?? []),
          thresholds,
        }),
      })
    } else if (row.action === 'DUPLICATE_FLAGGED' && enabled.duplicate_flagged && event) {
      const primaryId = duplicatePrimaryId(row.detail)
      const primary = primaryId
        ? await prisma.event.findUnique({ where: { id: primaryId }, select: { promoterId: true, promotions: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 } } })
        : null
      out.push({
        ...base,
        kind: 'DUPLICATE_FLAGGED',
        rule: 'duplicate_flagged',
        summary: event.title,
        apply: { ...base.apply, primaryId },
        ruling: ruleDuplicateFlagged({
          primaryPromoted: !!(primary?.promoterId || primary?.promotions.length),
          otherPromoted: !!(event.promoterId || event.promotions.length),
        }),
      })
    } else if (row.action === 'DUPLICATE_REVIEW' && enabled.duplicate_review && event) {
      out.push({
        ...base,
        kind: 'DUPLICATE_REVIEW',
        rule: 'duplicate_review',
        summary: event.title,
        ruling: null,
        prepare: () => prepareDuplicate(row.detail, event, thresholds, budget),
      })
    }
  }
  return pack(rows, out)
}

async function prepareCoords(
  auditId: string,
  event: { id: string; title: string; venueName: string; venueAddress: string | null; suburb: string | null; city: string; latitude: number | null; longitude: number | null },
  budget: BudgetFns,
): Promise<Ruling> {
  const failures = await prisma.opsDecision.count({ where: { targetType: 'quality_audit', targetId: auditId, action: 'geocode-failed', undoneAt: null } })
  let geocoded: { lat: number; lng: number } | null = null
  let triedAndMissed = false
  if (event.latitude == null || event.longitude == null) {
    const sibling = await prisma.event.findFirst({
      where: { id: { not: event.id }, city: event.city, venueName: event.venueName, latitude: { not: null }, longitude: { not: null } },
      select: { latitude: true, longitude: true },
    })
    if (sibling?.latitude != null && sibling.longitude != null && pinFitsCity(sibling.latitude, sibling.longitude, event.city, event.venueAddress, event.suburb)) {
      geocoded = { lat: sibling.latitude, lng: sibling.longitude }
    } else if (budget.takeGeo()) {
      const query = [event.venueName, event.venueAddress, event.suburb].filter(Boolean).join(', ')
      const pin = await locateAddress(query, event.city).catch(() => null)
      if (pin && pinFitsCity(pin.lat, pin.lng, event.city, event.venueAddress, event.suburb)) geocoded = pin
      else {
        triedAndMissed = true
        await decide({
          kind: 'MISSING_COORDS',
          targetType: 'quality_audit',
          targetId: auditId,
          action: 'geocode-failed',
          reason: 'Geocode did not return a pin in the event city.',
          confidence: 0.2,
          actor: 'bot:rules',
        })
      }
    }
  }
  const place = placeFromText({ venueAddress: event.venueAddress, venueName: event.venueName, suburb: event.suburb, city: event.city })
  return ruleMissingCoords({
    hasPin: event.latitude != null && event.longitude != null,
    geocoded,
    failures: failures + (triedAndMissed ? 1 : 0),
    centroid: place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : null,
  })
}

async function sourceFreshness(eventId: string | undefined, sources: string[]) {
  if (!eventId) return sources.map((source) => ({ source, refreshedAt: null as string | null }))
  const records = await prisma.sourceRecord.findMany({ where: { eventId }, select: { source: true, seenAt: true } })
  if (!records.length) return sources.map((source) => ({ source, refreshedAt: null as string | null }))
  return records.map((row) => ({ source: row.source, refreshedAt: row.seenAt.toISOString() }))
}

async function prepareDuplicate(
  detail: string | null,
  event: { id: string; title: string; venueName: string; date: Date; time: string | null; ticketUrl: string | null; sourceUrl: string | null },
  thresholds: Awaited<ReturnType<typeof loadRuleConfig>>['thresholds'],
  budget: BudgetFns,
): Promise<Ruling> {
  const primaryId = duplicatePrimaryId(detail)
  const primary = primaryId
    ? await prisma.event.findUnique({ where: { id: primaryId }, select: { title: true, venueName: true, date: true, time: true, ticketUrl: true, sourceUrl: true } })
    : null
  if (!primary) return ruleDuplicateReview({ score: null, thresholds })
  if (!budget.takeAi()) return { outcome: 'skip', reason: 'Model budget spent. Next run will try again.' }
  const when = (row: { date: Date; time: string | null }) => `${row.date.toISOString().slice(0, 16)} ${row.time ?? ''}`.trim()
  const score = await scoreDuplicate({
    left: { title: primary.title, venue: primary.venueName, when: when(primary), url: primary.sourceUrl || primary.ticketUrl || '' },
    right: { title: event.title, venue: event.venueName, when: when(event), url: event.sourceUrl || event.ticketUrl || '' },
  })
  return ruleDuplicateReview({ score, thresholds })
}

async function loadHeld(
  cursor: { id?: { gt: string } },
  liveSince: Date,
  allowBacklog: boolean,
  enabled: Record<RuleKey, boolean>,
  thresholds: Awaited<ReturnType<typeof loadRuleConfig>>['thresholds'],
  today: Date,
  budget: BudgetFns,
): Promise<Batch> {
  if (!enabled.held_events) return { items: [], lastId: null, more: false }
  const rows = await prisma.event.findMany({
    where: { moderationStatus: 'review', ...cursor },
    orderBy: { id: 'asc' },
    take: PAGE,
    select: { id: true, title: true, description: true, date: true, createdAt: true },
  })
  const out: Work[] = []
  for (const row of rows) {
    if (!shouldResolveExisting(row.createdAt, liveSince, allowBacklog)) continue
    const baseRuling = ruleHeldEvent({ title: row.title, description: row.description, past: past(row.date, today), thresholds })
    const obvious = baseRuling.outcome === 'act' && (baseRuling.action === 'close-past' || baseRuling.action === 'keep-hidden')
    out.push({
      kind: 'HELD_EVENT',
      rule: 'held_events',
      targetType: 'event',
      targetId: row.id,
      createdAt: row.createdAt,
      summary: row.title,
      apply: { eventId: row.id },
      ruling: obvious ? baseRuling : null,
      prepare: obvious ? undefined : async () => {
        if (!budget.takeAi()) return baseRuling
        const ai = await classifyHeld(row.title, row.description)
        return ruleHeldEvent({ title: row.title, description: row.description, past: past(row.date, today), ai, thresholds })
      },
    })
  }
  return pack(rows, out)
}

async function loadReports(
  cursor: { id?: { gt: string } },
  liveSince: Date,
  allowBacklog: boolean,
  enabled: Record<RuleKey, boolean>,
  thresholds: Awaited<ReturnType<typeof loadRuleConfig>>['thresholds'],
  budget: BudgetFns,
): Promise<Batch> {
  if (!enabled.event_reports) return { items: [], lastId: null, more: false }
  const rows = await prisma.eventReport.findMany({
    where: { status: 'OPEN', ...cursor },
    orderBy: { id: 'asc' },
    take: PAGE,
    include: { event: { select: { id: true, title: true, date: true, sourceUrl: true, ticketUrl: true, venueName: true, time: true } } },
  })
  const out: Work[] = []
  for (const row of rows) {
    if (!shouldResolveExisting(row.createdAt, liveSince, allowBacklog)) continue
    out.push({
      kind: 'EVENT_REPORT',
      rule: 'event_reports',
      targetType: 'event_report',
      targetId: row.id,
      createdAt: row.createdAt,
      summary: `${row.reason}: ${row.event.title}`,
      apply: { reportId: row.id, eventId: row.eventId, primaryId: null },
      ruling: null,
      prepare: async () => {
        if (row.reason === 'DUPLICATE') {
          if (!budget.takeAi()) return { outcome: 'skip', reason: 'Model budget spent. Next run will try again.' }
          const score = await scoreDuplicate({
            left: { title: row.event.title, venue: row.event.venueName, when: row.event.date.toISOString(), url: row.event.sourceUrl || '' },
            right: { title: row.details ?? row.event.title, venue: row.event.venueName, when: row.event.date.toISOString(), url: '' },
          })
          return ruleEventReport({ reason: 'DUPLICATE', source: null, score, thresholds })
        }
        if (row.reason === 'OTHER') {
          return ruleEventReport({ reason: 'OTHER', source: null, summary: row.details })
        }
        if (!budget.takeFetch()) return { outcome: 'skip', reason: 'Fetch budget spent. Next run will try again.' }
        const look = await sourceLook(row.event.sourceUrl || row.event.ticketUrl)
        const eventDay = row.event.date.toISOString().slice(0, 10)
        const source = look.ok && look.date && look.date !== eventDay ? look : { ...look, date: null }
        return ruleEventReport({ reason: row.reason, source, thresholds })
      },
    })
  }
  return pack(rows, out)
}

async function loadEventClaims(
  cursor: { id?: { gt: string } },
  liveSince: Date,
  allowBacklog: boolean,
  enabled: Record<RuleKey, boolean>,
): Promise<Batch> {
  if (!enabled.claims) return { items: [], lastId: null, more: false }
  const events = await prisma.eventClaim.findMany({
      where: { status: 'PENDING', ...cursor },
      orderBy: { id: 'asc' },
      take: PAGE,
      include: {
        user: { select: { email: true } },
        event: { select: { organiserUrl: true, ticketUrl: true, sourceUrl: true, promoterId: true, promotions: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 } } },
      },
    })
  const out: Work[] = []
  for (const row of events) {
    if (!shouldResolveExisting(row.createdAt, liveSince, allowBacklog)) continue
    const verified = await prisma.emailVerificationCode.findFirst({
      where: { purpose: 'EVENT_CLAIM', subjectId: row.id, usedAt: { not: null } },
      select: { id: true },
    })
    const urls = [row.event.organiserUrl, row.event.ticketUrl, row.event.sourceUrl]
    out.push({
      kind: 'EVENT_CLAIM',
      rule: 'claims',
      targetType: 'event_claim',
      targetId: row.id,
      createdAt: row.createdAt,
      summary: `Claim for listing ${row.eventId}`,
      apply: { claimId: row.id, claimKind: 'event', email: row.user.email },
      ruling: ruleClaim({
        email: row.user.email,
        organiserUrls: urls,
        emailVerified: !!verified,
        hasEvidence: !!row.evidenceUrl,
        dispute: false,
        promoted: !!(row.event.promoterId || row.event.promotions.length),
        domainMatches: emailMatchesOrganiser(row.user.email, urls),
      }),
    })
  }
  return pack(events, out)
}

async function loadVenueClaims(
  cursor: { id?: { gt: string } },
  liveSince: Date,
  allowBacklog: boolean,
  enabled: Record<RuleKey, boolean>,
): Promise<Batch> {
  if (!enabled.claims) return { items: [], lastId: null, more: false }
  const venues = await prisma.venueClaimRequest.findMany({
    where: { status: 'PENDING', ...cursor },
    orderBy: { id: 'asc' },
    take: PAGE,
    include: { venue: { select: { website: true, officialDomain: true, claimStatus: true } } },
  })
  const out: Work[] = []
  for (const row of venues) {
    if (!shouldResolveExisting(row.submittedAt, liveSince, allowBacklog)) continue
    const verified = await prisma.emailVerificationCode.findFirst({
      where: { purpose: 'VENUE_CLAIM', subjectId: row.id, usedAt: { not: null } },
      select: { id: true },
    })
    out.push({
      kind: 'VENUE_CLAIM',
      rule: 'claims',
      targetType: 'venue_claim',
      targetId: row.id,
      createdAt: row.submittedAt,
      summary: `Venue claim ${row.venueId}`,
      apply: { claimId: row.id, claimKind: 'venue', email: row.businessEmail },
      ruling: ruleClaim({
        email: row.businessEmail,
        organiserUrls: [row.venue.website, row.venue.officialDomain ? `https://${row.venue.officialDomain}` : null],
        emailVerified: !!verified,
        hasEvidence: !!row.evidenceReference,
        dispute: row.venue.claimStatus === 'CLAIMED',
        promoted: false,
        domainMatches: emailMatchesOrganiser(row.businessEmail, [row.venue.website, row.venue.officialDomain ? `https://${row.venue.officialDomain}` : null]),
      }),
    })
  }
  return pack(venues, out)
}

async function loadVenueChanges(
  cursor: { id?: { gt: string } },
  liveSince: Date,
  allowBacklog: boolean,
  enabled: Record<RuleKey, boolean>,
): Promise<Batch> {
  if (!enabled.venue_profile) return { items: [], lastId: null, more: false }
  const rows = await prisma.venueProfileChange.findMany({
    where: { status: 'PENDING', ...cursor },
    orderBy: { id: 'asc' },
    take: PAGE,
  })
  const out: Work[] = []
  for (const row of rows) {
    if (!shouldResolveExisting(row.createdAt, liveSince, allowBacklog)) continue
    const grant = await prisma.venueManagementGrant.findFirst({
      where: { venueId: row.venueId, status: 'APPROVED', revokedAt: null },
      select: { id: true },
    })
    const suspect = fakePublicUrl(row.proposedValue) || /picsum|placehold|unsplash\.com\/random/i.test(row.proposedValue)
    out.push({
      kind: 'VENUE_PROFILE',
      rule: 'venue_profile',
      targetType: 'venue_profile',
      targetId: row.id,
      createdAt: row.createdAt,
      summary: `${row.fieldName} change`,
      apply: { changeId: row.id, venueId: row.venueId, field: row.fieldName, value: row.proposedValue },
      ruling: ruleVenueProfile({ field: row.fieldName, verifiedManager: !!grant, imageSuspect: suspect }),
    })
  }
  return pack(rows, out)
}
