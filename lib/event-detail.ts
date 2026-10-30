import { unstable_cache } from 'next/cache'
import { after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sydneyToday } from '@/lib/event-store'
import { activeTierMap } from '@/lib/promotions'
import { friendsGoing } from '@/lib/social'
import { getSessionUser } from '@/lib/session'
import { imageAssetSelect } from '@/lib/images/spec'
import { idFromEventParam, isPastEvent } from '@/lib/seo'
import { activityTitle, priceSummary, scheduleCue, similarity, normalizeTitle, normalizeVenue, statusInfo, sourceLabel, RECURRENCE_LABEL, type Recurrence } from '@/lib/quality'
import { queueNearStartRecheck } from '@/lib/verification-pass'
import { recordReferral, type ReferralSource } from '@/lib/referrals'
import { recordSignal } from '@/lib/event-signals'
import { canManageEvent, ownershipPresentation } from '@/lib/event-overrides'
import { VENUE_MANAGED_LABEL } from '@/lib/ownership'
import { recordCampaignConversion } from '@/lib/sponsorship-store'
import { PUBLIC_EVENT_AND, redactCommunityPublic } from '@/lib/community-shared'

const RELATED_SELECT = {
  id: true, title: true, date: true, endDate: true, time: true, endTime: true,
  venueName: true, venueAddress: true, suburb: true, city: true,
  category: true, subTags: true, isLGBTI: true, isFree: true,
  price: true, priceMin: true, priceMax: true, imageUrl: true, ticketUrl: true, source: true,
  latitude: true, longitude: true, seriesKey: true,
  communityKey: true, locationVisibility: true, childrenInImage: true, imageKidSafe: true,
  imageAsset: { select: imageAssetSelect },
} as const

type DetailOpts = { countView?: boolean; prefetch?: boolean; referral?: ReferralSource | null }

async function resolveEventId(param: string): Promise<string | null> {
  const raw = decodeURIComponent(param)
  const direct = await prisma.event.findUnique({ where: { id: raw }, select: { id: true } })
  if (direct) return direct.id
  const tail = idFromEventParam(raw)
  if (!tail || tail === raw) return null
  const viaSlug = await prisma.event.findUnique({ where: { id: tail }, select: { id: true } })
  return viaSlug?.id ?? null
}

const cachedResolve = unstable_cache(resolveEventId, ['event-resolve-v1'], { revalidate: 300 })

async function queryEventCore(id: string) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: { promoter: { select: { id: true, name: true, orgName: true, proUntil: true } }, _count: { select: { attendees: true } }, imageAsset: { select: imageAssetSelect } },
  })
  if (!event || isPastEvent(event) || event.deletedAt) return null
  if (event.approvalState && event.approvalState !== 'APPROVED') return null
  const redacted = redactCommunityPublic(event)
  if (!redacted.imageUrl) redacted.imageAsset = null

  const [relatedRows, tiers, duplicateTarget] = await Promise.all([
    prisma.event.findMany({
      where: {
        id: { not: event.id },
        city: event.city,
        date: { gte: sydneyToday() },
        duplicateOfId: null,
        AND: [...PUBLIC_EVENT_AND],
        OR: [{ category: event.category }, { venueName: event.venueName }],
        ...(event.seriesKey ? { NOT: { seriesKey: event.seriesKey } } : {}),
      },
      take: 24,
      orderBy: { date: 'asc' },
      select: RELATED_SELECT,
    }),
    activeTierMap([event.id]),
    event.duplicateOfId
      ? prisma.event.findUnique({ where: { id: event.duplicateOfId }, select: { id: true, title: true } })
      : Promise.resolve(null),
  ])

  const ownActivity = activityTitle(event.title)
  const related = relatedRows.filter((r) => {
    const ts = similarity(normalizeTitle(event.title), normalizeTitle(r.title))
    const vs = similarity(normalizeVenue(event.venueName), normalizeVenue(r.venueName))
    if (ts >= 0.8 && vs >= 0.34) return false
    if (vs >= 0.8 && ts >= 0.55) return false
    const other = activityTitle(r.title)
    if (ownActivity && other && ownActivity === other && vs >= 0.34) return false
    return true
  }).slice(0, 6).map((row) => redactCommunityPublic(row))

  const { _count, promoter, views: _v, ticketClicks: _c, confidenceScore: _score, contactEmail: _email, submitIpHash: _ip, manageTokenHash: _token, emailVerifiedAt: _verifiedAt, communityFlags: _flags, ...rest } = redacted
  const presentation = await ownershipPresentation(event.id, event.materialConflict).catch(() => ({ notice: null, caution: null, venueManaged: false }))
  const payload = {
    event: {
      ...rest,
      promoter: promoter ? { id: promoter.id, name: promoter.name, orgName: promoter.orgName } : null,
      attendeeCount: _count.attendees,
      promoTier: tiers[event.id] ?? null,
      quality: {
        status: statusInfo(event.status, event.statusSource),
        price: priceSummary(event),
        recurrence: event.recurrence ? RECURRENCE_LABEL[event.recurrence as Recurrence] ?? null : null,
        sources: [...new Set([event.source, ...(event.sources ?? [])])].map(sourceLabel),
        checkedAt: (event.lastVerifiedAt ?? event.updatedAt).toISOString(),
        schedule: scheduleCue(event),
      },
      organiserUpdate: presentation.notice,
      listingCaution: presentation.caution,
      venueManagedLabel: presentation.venueManaged ? VENUE_MANAGED_LABEL : null,
    },
    related,
    duplicateTarget,
  }
  return JSON.parse(JSON.stringify(payload)) as typeof payload
}

const cachedCore = unstable_cache(queryEventCore, ['event-core-v3'], { revalidate: 120 })

export type PublicEvent = NonNullable<Awaited<ReturnType<typeof queryEventCore>>>

/** Shared by the event page and its metadata. Null when the listing is missing or already over. */
export async function getPublicEvent(idOrParam: string): Promise<PublicEvent | null> {
  const id = await cachedResolve(idOrParam)
  if (!id) return null
  return cachedCore(id)
}

function reviveEvent<T extends { date: string | Date; endDate?: string | Date | null; lastVerifiedAt?: string | Date | null; updatedAt?: string | Date | null }>(event: T) {
  const at = (value: string | Date | null | undefined) => (value == null ? null : new Date(value))
  return {
    ...event,
    date: new Date(event.date),
    endDate: at(event.endDate),
    lastVerifiedAt: at(event.lastVerifiedAt),
    updatedAt: event.updatedAt ? new Date(event.updatedAt) : event.updatedAt,
  }
}

/**
 * Public listing plus the signed-in visitor's flags.
 * View counts, referrals and signals run after the response is sent.
 */
export async function personalizeEvent(core: PublicEvent, opts: DetailOpts = {}) {
  const event = reviveEvent(core.event)
  const me = await getSessionUser().catch(() => null)
  const ownerView = !!me && me.id === event.promoterId
  const countView = !!opts.countView && !opts.prefetch && !ownerView
  const signalView = !!me && !!opts.countView && !opts.prefetch
  if (!opts.prefetch) {
    const eventId = event.id
    const referral = opts.referral ?? null
    const userId = me?.id
    const recheck = {
      id: event.id,
      date: event.date,
      endDate: event.endDate,
      time: event.time,
      endTime: event.endTime,
      city: event.city,
      status: event.status,
      duplicateOfId: event.duplicateOfId,
      source: event.source,
      isFree: event.isFree,
      lastVerifiedAt: event.lastVerifiedAt,
    }
    after(() => {
      const jobs: Promise<unknown>[] = [
        queueNearStartRecheck(recheck).catch((e) => console.error('near-start check failed', e?.message)),
      ]
      if (countView) {
        jobs.push(prisma.event.update({ where: { id: eventId }, data: { views: { increment: 1 } }, select: { id: true } }).catch((e) => console.error('view count failed', e?.message)))
      }
      if (referral) recordReferral(eventId, referral)
      if (signalView && userId) jobs.push(recordSignal(userId, eventId, 'VIEW'))
      if (countView) jobs.push(recordCampaignConversion(eventId, 'DETAIL', userId))
      return Promise.all(jobs)
    })
  }

  const [friends, mine, following] = await Promise.all([
    me ? friendsGoing(me.id, [event.id]) : Promise.resolve({} as Record<string, string[]>),
    me ? prisma.attendance.findUnique({ where: { userId_eventId: { userId: me.id, eventId: event.id } } }) : Promise.resolve(null),
    me && event.promoterId
      ? prisma.promoterFollow.findUnique({ where: { followerId_promoterId: { followerId: me.id, promoterId: event.promoterId } } })
      : Promise.resolve(null),
  ])

  return {
    event: {
      ...event,
      friendsGoing: friends[event.id] ?? [],
      going: !!mine,
      followingPromoter: !!following,
      isMine: !!me && !!event.promoterId && event.promoterId === me.id,
      canManageListing: me ? (await canManageEvent(me.id, event.id, me.role === 'ADMIN').catch(() => null))?.access.allowed ?? false : false,
    },
    related: core.related,
    signedIn: !!me,
  }
}

/** Full event detail payload shared by the event page and GET /api/events/[id]. */
export async function getEventDetail(idOrParam: string, opts: DetailOpts = {}) {
  const core = await getPublicEvent(idOrParam)
  if (!core) return null
  return personalizeEvent(core, opts)
}

export type EventDetailPayload = NonNullable<Awaited<ReturnType<typeof getEventDetail>>>
