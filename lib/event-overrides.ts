/**
 * Per-field organiser overrides and event grants.
 * Displayed listing columns stay on Event. The source value for an overridden field
 * lives on EventFieldOverride so a refresh can update it without touching the public value.
 */
import { prisma } from '@/lib/db'
import { scheduleFields } from '@/lib/listing-window'
import { parsePriceRange } from '@/lib/quality'
import {
  OVERRIDE_FIELDS,
  VENUE_CORRECTION_FIELDS,
  applyOverride,
  authorizeEventMutation,
  claimedOrganiserVisible,
  editChoices,
  evaluateEventAccess,
  fieldDiffs,
  materialCaution,
  planSourceRefresh,
  publicOrganiserNotice,
  publicVenueNotice,
  registrableDomain,
  restoreField,
  type OverrideField,
} from '@/lib/ownership'

const FIELD_LIST = [...OVERRIDE_FIELDS]

function missingRelation(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === 'P2021' || code === 'P2022'
}

export async function logSecurity(actorId: string | null, action: string, targetType: string, targetId: string, detail?: string) {
  await prisma.securityAudit.create({
    data: { actorId, action, targetType, targetId, detail: detail?.slice(0, 500) ?? null },
  }).catch((err) => {
    if (!missingRelation(err)) console.error('security audit failed', (err as { message?: string })?.message)
  })
}

type AccessEvent = {
  id: string
  promoterId: string | null
  venueId: string | null
  source: string
  sourceUrl: string | null
  sourceEditUrl: string | null
  ticketUrl: string | null
  organiserUrl: string | null
  title: string
  description: string | null
  time: string | null
  endTime: string | null
  venueName: string
  venueAddress: string | null
  status: string
  price: string | null
  category: string
  date: Date
  city: string
  materialConflict: string | null
  isFree: boolean
}

const eventSelect = {
  id: true, promoterId: true, venueId: true, source: true, sourceUrl: true, sourceEditUrl: true,
  ticketUrl: true, organiserUrl: true, title: true, description: true, time: true, endTime: true,
  venueName: true, venueAddress: true, status: true, price: true, category: true, date: true,
  city: true, materialConflict: true, isFree: true,
} as const

export async function canManageEvent(userId: string, eventId: string, isAdmin = false) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: eventSelect })
  if (!event) return { event: null, access: { allowed: false as const, via: null } }
  let memberships: { userId: string; organisationId: string; role: string; status: string; revokedAt: Date | null }[] = []
  let grants: { eventId: string; organisationId: string; status: string; revokedAt: Date | null }[] = []
  try {
    memberships = await prisma.organisationMembership.findMany({
      where: { userId },
      select: { userId: true, organisationId: true, role: true, status: true, revokedAt: true },
    })
    const orgIds = memberships.map((row) => row.organisationId)
    grants = orgIds.length
      ? await prisma.eventManagementGrant.findMany({
        where: { eventId, organisationId: { in: orgIds } },
        select: { eventId: true, organisationId: true, status: true, revokedAt: true },
      })
      : []
  } catch (err) {
    if (!missingRelation(err)) throw err
  }
  const access = evaluateEventAccess({
    userId,
    eventId,
    promoterId: event.promoterId,
    isAdmin,
    memberships,
    grants,
  })
  return { event: event as AccessEvent, access }
}

function currentMap(event: AccessEvent): Record<string, string | null> {
  return {
    title: event.title,
    description: event.description,
    date: event.date.toISOString().slice(0, 10),
    time: event.time,
    endTime: event.endTime,
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    status: event.status,
    price: event.price,
    category: event.category,
  }
}

function columnPatch(event: AccessEvent, field: string, value: string | null): Record<string, unknown> {
  if (field === 'date') {
    const date = value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : event.date
    const sched = scheduleFields({ ...event, date, time: event.time, endTime: event.endTime, status: event.status })
    return { date, timezone: sched.timezone, allDay: sched.allDay, startsAt: sched.startsAt, endsAt: sched.endsAt }
  }
  if (field === 'time' || field === 'endTime') {
    const time = field === 'time' ? value : event.time
    const endTime = field === 'endTime' ? value : event.endTime
    const sched = scheduleFields({ ...event, time, endTime, status: event.status })
    return { [field]: value, timezone: sched.timezone, allDay: sched.allDay, startsAt: sched.startsAt, endsAt: sched.endsAt }
  }
  if (field === 'status') {
    return { status: value || 'SCHEDULED', statusSource: 'organiser' }
  }
  if (field === 'price') {
    const free = !value || /^(free|0|\$0)$/i.test(value.trim())
    const range = parsePriceRange(free, free ? 'Free' : value)
    return { price: free ? 'Free' : value, isFree: free, priceMin: range.min, priceMax: range.max }
  }
  if (field === 'imageUrl') return { imageUrl: value }
  return { [field]: value }
}

export async function readManagePayload(userId: string, eventId: string, isAdmin = false) {
  const loaded = await canManageEvent(userId, eventId, isAdmin)
  if (!loaded.event) return null
  if (!loaded.access.allowed) {
    const decision = authorizeEventMutation(false)
    if (decision.log) await logSecurity(userId, 'read-manage', 'event', eventId, 'no event grant')
    return { forbidden: true as const }
  }
  const [overrides, ack, history] = await Promise.all([
    prisma.eventFieldOverride.findMany({ where: { eventId } }),
    prisma.eventEditAck.findUnique({ where: { userId_eventId: { userId, eventId } } }),
    prisma.eventOverrideHistory.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ])
  const current = currentMap(loaded.event)
  const active = overrides.filter((row) => row.active)
  const source: Record<string, string | null> = { ...current }
  for (const row of active) source[row.fieldName] = row.originalSourceValue
  const choices = editChoices({ sourceUrl: loaded.event.sourceUrl || loaded.event.ticketUrl, managementUrl: loaded.event.sourceEditUrl })
  return {
    forbidden: false as const,
    event: {
      id: loaded.event.id,
      title: loaded.event.title,
      source: loaded.event.source,
      status: loaded.event.status,
      materialConflict: loaded.event.materialConflict,
    },
    choices,
    acknowledged: !!ack,
    notice: publicOrganiserNotice(active, active.reduce<string | null>((latest, row) => {
      const iso = row.updatedAt.toISOString()
      return !latest || iso > latest ? iso : latest
    }, null)),
    diffs: fieldDiffs(source, current, FIELD_LIST),
    history: history.map((row) => ({
      fieldName: row.fieldName,
      action: row.action,
      previousValue: row.previousValue,
      updatedValue: row.updatedValue,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}

export async function acknowledgeDirectEdit(userId: string, eventId: string, isAdmin = false) {
  const loaded = await canManageEvent(userId, eventId, isAdmin)
  if (!loaded.event) return { status: 404 as const, error: 'Event not found' }
  if (!loaded.access.allowed) {
    await logSecurity(userId, 'ack-edit', 'event', eventId)
    return { status: 403 as const, error: 'You don’t manage this event.' }
  }
  await prisma.eventEditAck.upsert({
    where: { userId_eventId: { userId, eventId } },
    create: { userId, eventId },
    update: { acknowledgedAt: new Date() },
  })
  return { status: 200 as const, ok: true }
}

export async function saveOverrides(userId: string, eventId: string, body: { fields?: Record<string, unknown>; confirmed?: boolean }, isAdmin = false) {
  const loaded = await canManageEvent(userId, eventId, isAdmin)
  if (!loaded.event) return { status: 404 as const, error: 'Event not found' }
  const decision = authorizeEventMutation(loaded.access.allowed)
  if (!decision.ok) {
    if (decision.log) await logSecurity(userId, 'edit-event', 'event', eventId, 'rejected direct edit')
    return { status: 403 as const, error: 'You don’t manage this event.' }
  }
  const ack = await prisma.eventEditAck.findUnique({ where: { userId_eventId: { userId, eventId } } })
  if (!ack && loaded.event.source !== 'promoter') {
    return { status: 409 as const, error: 'Read the note about editing on VibePeep first.', needAck: true }
  }
  const incoming = body.fields ?? {}
  const current = currentMap(loaded.event)
  const existing = await prisma.eventFieldOverride.findMany({ where: { eventId } })
  const orgId = loaded.access.via === 'grant'
    ? (await prisma.eventManagementGrant.findFirst({ where: { eventId, status: 'APPROVED' }, select: { organisationId: true } }))?.organisationId ?? null
    : null
  const applied: string[] = []
  for (const field of Object.keys(incoming)) {
    const value = String(incoming[field] ?? '').trim()
    if (!value) continue
    const row = existing.find((item) => item.fieldName === field) ?? null
    const result = applyOverride({
      current,
      field,
      value,
      existing: row ? { fieldName: row.fieldName, overrideValue: row.overrideValue, originalSourceValue: row.originalSourceValue, active: row.active } : null,
      confirmed: body.confirmed === true,
    })
    if (!result.ok) return { status: 400 as const, error: result.error, field }
    const original = result.row.originalSourceValue
    await prisma.eventFieldOverride.upsert({
      where: { eventId_fieldName: { eventId, fieldName: field } },
      create: {
        eventId,
        fieldName: field,
        overrideValue: result.row.overrideValue,
        originalSourceValue: original,
        updatedBy: userId,
        authorisedOrganisationId: orgId,
        verificationContext: loaded.access.via,
        active: true,
      },
      update: {
        overrideValue: result.row.overrideValue,
        originalSourceValue: row?.originalSourceValue ?? original,
        updatedBy: userId,
        authorisedOrganisationId: orgId,
        verificationContext: loaded.access.via,
        active: true,
      },
    })
    await prisma.event.update({ where: { id: eventId }, data: columnPatch(loaded.event, field, result.eventValue) })
    await prisma.eventOverrideHistory.create({
      data: { eventId, fieldName: field, action: result.historyAction, previousValue: current[field] ?? null, updatedValue: result.eventValue, actorId: userId },
    })
    const previousStatus = current.status
    current[field] = result.eventValue
    Object.assign(loaded.event, columnPatch(loaded.event, field, result.eventValue))
    if (field === 'date' && result.eventValue) loaded.event.date = new Date(`${result.eventValue.slice(0, 10)}T00:00:00.000Z`)
    if (field === 'time') loaded.event.time = result.eventValue
    if (field === 'endTime') loaded.event.endTime = result.eventValue
    if (field === 'status' && result.eventValue && result.eventValue !== previousStatus) {
      const { notifyEventStatusChange } = await import('@/lib/listing-change-mail')
      await notifyEventStatusChange(eventId, previousStatus || loaded.event.status, result.eventValue, { date: loaded.event.date, time: loaded.event.time }).catch((err) => console.error('[email] listing change', err instanceof Error ? err.message : err))
      loaded.event.status = result.eventValue
    }
    applied.push(field)
  }
  if (!applied.length) return { status: 400 as const, error: 'Change a field first.' }
  return { status: 200 as const, ok: true, fields: applied }
}

export async function restoreOverride(userId: string, eventId: string, field: string, isAdmin = false) {
  const loaded = await canManageEvent(userId, eventId, isAdmin)
  if (!loaded.event) return { status: 404 as const, error: 'Event not found' }
  if (!loaded.access.allowed) {
    await logSecurity(userId, 'restore-field', 'event', eventId)
    return { status: 403 as const, error: 'You don’t manage this event.' }
  }
  if (!OVERRIDE_FIELDS.includes(field as OverrideField)) return { status: 400 as const, error: 'Unknown field.' }
  const row = await prisma.eventFieldOverride.findUnique({ where: { eventId_fieldName: { eventId, fieldName: field } } })
  const restored = restoreField({
    field,
    current: currentMap(loaded.event)[field] ?? null,
    row: row ? { fieldName: row.fieldName, overrideValue: row.overrideValue, originalSourceValue: row.originalSourceValue, active: row.active } : null,
  })
  if (!restored || !row) return { status: 404 as const, error: 'That field is already using the source.' }
  await prisma.eventFieldOverride.update({ where: { id: row.id }, data: { active: false } })
  await prisma.event.update({ where: { id: eventId }, data: columnPatch(loaded.event, field, restored.eventValue) })
  await prisma.eventOverrideHistory.create({
    data: { eventId, fieldName: field, action: 'RESTORE', previousValue: row.overrideValue, updatedValue: restored.eventValue, actorId: userId },
  })
  const still = await prisma.eventFieldOverride.count({ where: { eventId, active: true } })
  if (!still) await prisma.event.update({ where: { id: eventId }, data: { materialConflict: null } })
  return { status: 200 as const, ok: true }
}

function httpsImage(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    return url.toString().slice(0, 2000)
  } catch {
    return null
  }
}

/** Venue-owner corrections. They publish immediately and the next ingest keeps them. */
export async function saveVenueCorrections(userId: string, eventId: string, body: Record<string, unknown>, organisationId: string | null) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { ...eventSelect, imageUrl: true } })
  if (!event) return { status: 404 as const, error: 'Event not found' }
  const proposed: Record<string, string> = {}
  if (typeof body.price === 'string' && body.price.trim()) proposed.price = body.price.trim().slice(0, 80)
  if (typeof body.time === 'string' && body.time.trim()) {
    const time = body.time.trim()
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { status: 400 as const, error: 'Time looks like 19:30.' }
    proposed.time = time
  }
  if (typeof body.imageUrl === 'string' && body.imageUrl.trim()) {
    const image = httpsImage(body.imageUrl.trim())
    if (!image) return { status: 400 as const, error: 'The image needs an https link.' }
    proposed.imageUrl = image
  }
  if (body.status === 'CANCELLED' || body.status === 'SCHEDULED') proposed.status = body.status
  if (!Object.keys(proposed).length) return { status: 400 as const, error: 'Change a price, time, image or cancellation first.' }

  const current: Record<string, string | null> = { ...currentMap(event), imageUrl: event.imageUrl }
  const existing = await prisma.eventFieldOverride.findMany({ where: { eventId, fieldName: { in: Object.keys(proposed) } } })
  const ready: { field: string; value: string; eventValue: string; original: string | null }[] = []
  for (const [field, value] of Object.entries(proposed)) {
    if (!VENUE_CORRECTION_FIELDS.includes(field as (typeof VENUE_CORRECTION_FIELDS)[number])) continue
    const row = existing.find((item) => item.fieldName === field)
    const result = applyOverride({
      current,
      field,
      value,
      confirmed: body.confirmed === true,
      existing: row ? { fieldName: row.fieldName, overrideValue: row.overrideValue, originalSourceValue: row.originalSourceValue, active: row.active, verificationContext: row.verificationContext } : null,
    })
    if (!result.ok) {
      if (result.error === 'That already matches the listing.') continue
      return { status: 400 as const, error: result.error }
    }
    ready.push({ field, value, eventValue: result.eventValue, original: result.row.originalSourceValue })
  }
  if (!ready.length) return { status: 400 as const, error: 'That already matches the listing.' }
  const applied: string[] = []
  for (const change of ready) {
    const { field, eventValue, original } = change
    await prisma.eventFieldOverride.upsert({
      where: { eventId_fieldName: { eventId, fieldName: field } },
      create: {
        eventId,
        fieldName: field,
        overrideValue: eventValue,
        originalSourceValue: original,
        updatedBy: userId,
        authorisedOrganisationId: organisationId,
        verificationContext: 'venue',
        active: true,
      },
      update: {
        overrideValue: eventValue,
        active: true,
        updatedBy: userId,
        authorisedOrganisationId: organisationId,
        verificationContext: 'venue',
      },
    })
    const patch = columnPatch(event, field, eventValue)
    if (field === 'status') patch.statusSource = 'venue'
    await prisma.event.update({ where: { id: eventId }, data: patch })
    const previousStatus = current.status || event.status
    if (field === 'status' && eventValue && eventValue !== previousStatus) {
      const { notifyEventStatusChange } = await import('@/lib/listing-change-mail')
      await notifyEventStatusChange(eventId, previousStatus, eventValue, { date: event.date, time: event.time }).catch((err) => console.error('[email] listing change', err instanceof Error ? err.message : err))
    }
    await prisma.eventOverrideHistory.create({
      data: { eventId, fieldName: field, action: 'SET', previousValue: current[field] ?? null, updatedValue: eventValue, actorId: userId },
    })
    current[field] = eventValue
    Object.assign(event, patch)
    applied.push(field)
  }
  if (!applied.length) return { status: 400 as const, error: 'That already matches the listing.' }
  const { invalidatePublicEvents } = await import('@/lib/public-cache')
  await invalidatePublicEvents()
  return { status: 200 as const, ok: true as const, fields: applied, label: 'from the venue' as const }
}

/**
 * Called from source refresh. Returns true when active overrides absorbed the update.
 * Missing tables fall through so a deploy before the migration does not stop refresh.
 */
export async function applyProtectedRefresh(eventId: string, incoming: Record<string, string | null | undefined>, patch: Record<string, unknown>): Promise<boolean> {
  let rows: { fieldName: string; overrideValue: string; originalSourceValue: string | null; active: boolean }[] = []
  try {
    rows = await prisma.eventFieldOverride.findMany({
      where: { eventId, active: true },
      select: { fieldName: true, overrideValue: true, originalSourceValue: true, active: true },
    })
  } catch (err) {
    if (missingRelation(err)) return false
    throw err
  }
  if (!rows.length) return false
  const current = await prisma.event.findUnique({
    where: { id: eventId },
    select: { title: true, description: true, time: true, endTime: true, venueName: true, venueAddress: true, status: true, price: true, category: true, date: true, imageUrl: true },
  })
  if (!current) return false
  const plan = planSourceRefresh({
    current: {
      title: current.title,
      description: current.description,
      date: current.date.toISOString().slice(0, 10),
      time: current.time,
      endTime: current.endTime,
      venueName: current.venueName,
      venueAddress: current.venueAddress,
      status: current.status,
      price: current.price,
      category: current.category,
      imageUrl: current.imageUrl,
    },
    incoming,
    overrides: rows,
  })
  const data: Record<string, unknown> = { ...patch }
  for (const field of FIELD_LIST) {
    if (field in plan.eventPatch) continue
    if (!(field in incoming) && !rows.some((row) => row.fieldName === field)) continue
    delete data[field]
    if (field === 'time' || field === 'date' || field === 'endTime') {
      delete data.startsAt
      delete data.endsAt
      delete data.allDay
      delete data.timezone
    }
    if (field === 'status') delete data.statusSource
    if (field === 'price') {
      delete data.priceMin
      delete data.priceMax
      delete data.isFree
    }
    if (field === 'imageUrl') delete data.imageAssetId
    if (field === 'date') delete data.endDate
    if (field === 'category') delete data.subTags
  }
  if (plan.materialConflict) data.materialConflict = plan.materialConflict
  else if (incoming.status !== undefined) data.materialConflict = null
  await prisma.event.update({ where: { id: eventId }, data })
  for (const snap of plan.snapshots) {
    await prisma.eventFieldOverride.update({
      where: { eventId_fieldName: { eventId, fieldName: snap.fieldName } },
      data: { originalSourceValue: snap.originalSourceValue, active: snap.deactivate ? false : true },
    })
  }
  if (plan.history.length) {
    await prisma.eventOverrideHistory.createMany({
      data: plan.history.map((row) => ({
        eventId,
        fieldName: row.fieldName,
        action: row.action,
        previousValue: row.previousValue,
        updatedValue: row.updatedValue,
      })),
    })
  }
  return true
}

export async function ensureOrganiserGrant(userId: string, eventId: string, orgName: string, email: string) {
  const domain = registrableDomain(email.split('@')[1] ?? '')
  const membership = await prisma.organisationMembership.findFirst({
    where: { userId, status: 'ACTIVE', role: { in: ['ORGANISER', 'ADMINISTRATOR'] }, organisation: { organisationType: 'ORGANISER' } },
    include: { organisation: true },
  })
  const org = membership
    ? await prisma.organisation.update({
      where: { id: membership.organisationId },
      data: { verificationStatus: 'VERIFIED', emailDomain: membership.organisation.emailDomain ?? (domain || null), name: membership.organisation.name || orgName },
    })
    : await prisma.organisation.create({
      data: {
        name: orgName,
        organisationType: 'ORGANISER',
        verificationStatus: 'VERIFIED',
        emailDomain: domain || null,
        memberships: { create: { userId, role: 'ORGANISER', status: 'ACTIVE' } },
      },
    })
  await prisma.eventManagementGrant.upsert({
    where: { eventId_organisationId: { eventId, organisationId: org.id } },
    create: { eventId, organisationId: org.id, status: 'APPROVED', approvedAt: new Date() },
    update: { status: 'APPROVED', approvedAt: new Date(), revokedAt: null },
  })
  return org
}

export async function ownershipPresentation(eventId: string, materialConflict: string | null) {
  try {
    const [overrides, report, event, grants] = await Promise.all([
      prisma.eventFieldOverride.findMany({ where: { eventId, active: true }, select: { fieldName: true, overrideValue: true, originalSourceValue: true, active: true, updatedAt: true, verificationContext: true } }),
      prisma.venueEventReport.findFirst({ where: { eventId, caution: true, status: { in: ['OPEN', 'IN_REVIEW'] } }, select: { id: true } }),
      prisma.event.findUnique({ where: { id: eventId }, select: { promoterId: true, venue: { select: { claimStatus: true } } } }),
      prisma.eventManagementGrant.findMany({
        where: { eventId },
        select: {
          status: true,
          revokedAt: true,
          organisation: {
            select: {
              organisationType: true,
              verificationStatus: true,
              memberships: { select: { userId: true, role: true, status: true, revokedAt: true } },
            },
          },
        },
      }),
    ])
    const latestOf = (rows: typeof overrides) => rows.reduce<string | null>((best, row) => {
      const iso = row.updatedAt.toISOString()
      return !best || iso > best ? iso : best
    }, null)
    const venueRows = overrides.filter((row) => row.verificationContext === 'venue')
    const organiserRows = overrides.filter((row) => row.verificationContext !== 'venue')
    const caution = materialCaution(materialConflict) || (report ? 'A venue representative asked us to check this listing. The event itself is unchanged while we look.' : null)
    const organiserClaimed = claimedOrganiserVisible(event?.promoterId, grants.map((grant) => ({
      grantStatus: grant.status,
      grantRevokedAt: grant.revokedAt,
      organisationType: grant.organisation.organisationType,
      verificationStatus: grant.organisation.verificationStatus,
      memberships: grant.organisation.memberships,
    })))
    return {
      notice: publicOrganiserNotice(organiserRows, latestOf(organiserRows)),
      venueNotice: publicVenueNotice(venueRows, latestOf(venueRows)),
      caution,
      venueManaged: event?.venue?.claimStatus === 'CLAIMED',
      organiserClaimed,
    }
  } catch (err) {
    if (!missingRelation(err)) console.error('ownership presentation failed', (err as { message?: string })?.message)
    return { notice: null, venueNotice: null, caution: materialCaution(materialConflict), venueManaged: false, organiserClaimed: false }
  }
}

/** True when this account still belongs to a checked organiser organisation. */
export async function organiserNameClaimed(userId: string): Promise<boolean> {
  try {
    const membership = await prisma.organisationMembership.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        revokedAt: null,
        role: { in: ['ORGANISER', 'ADMINISTRATOR'] },
        organisation: { organisationType: 'ORGANISER', verificationStatus: 'VERIFIED' },
      },
      select: { id: true },
    })
    return !!membership
  } catch (err) {
    if (!missingRelation(err)) console.error('organiser name claim lookup failed', (err as { message?: string })?.message)
    return false
  }
}

export async function verifiedOrganiserDomain(userId: string): Promise<string | null> {
  const membership = await prisma.organisationMembership.findFirst({
    where: { userId, status: 'ACTIVE', role: { in: ['ORGANISER', 'ADMINISTRATOR'] }, organisation: { organisationType: 'ORGANISER', verificationStatus: 'VERIFIED' } },
    include: { organisation: { select: { emailDomain: true } } },
  })
  return membership?.organisation.emailDomain ?? null
}
