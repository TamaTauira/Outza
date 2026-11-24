import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { approveClaim } from '@/lib/trust'
import { approveVenueClaim, rejectVenueClaim } from '@/lib/venue-access'
import { requestClaimEvidence, thankReporter } from '@/lib/ops/hooks'
import { IMAGE_VENUE_FIELDS, SAFE_VENUE_FIELDS } from '@/lib/ops/rules'
import type { Snapshot } from '@/lib/ops/types'

const EVENT_STATUS = new Set(['SCHEDULED', 'CANCELLED', 'POSTPONED', 'RESCHEDULED', 'SOLD_OUT'])

export type ApplyInput = {
  action?: string
  auditId?: string | null
  eventId?: string | null
  reportId?: string | null
  claimId?: string | null
  claimKind?: 'event' | 'venue' | null
  venueId?: string | null
  changeId?: string | null
  field?: string | null
  value?: string | null
  primaryId?: string | null
  email?: string | null
  patch?: Record<string, unknown> | null
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

async function eventSnapshot(id: string): Promise<Snapshot['event'] | undefined> {
  const row = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true, duplicateOfId: true, latitude: true, longitude: true, hidden: true,
      moderationStatus: true, status: true, date: true, promoterId: true,
    },
  })
  if (!row) return undefined
  return { ...row, date: row.date.toISOString() }
}

async function closeAudit(id: string, status: 'DISMISSED' | 'APPROVED', before: Snapshot) {
  const row = await prisma.qualityAudit.findUnique({ where: { id }, select: { id: true, status: true, reviewedAt: true } })
  if (!row) return
  before.qualityAudit = { id: row.id, status: row.status, reviewedAt: iso(row.reviewedAt) }
  if (row.status === 'OPEN') {
    await prisma.qualityAudit.update({ where: { id }, data: { status, reviewedAt: new Date() } })
  }
}

/** Applies one ruling. Returns the previous values so undo can put them back. */
export async function applyOpsAction(input: ApplyInput): Promise<{ before: Snapshot; after: Record<string, unknown> }> {
  const before: Snapshot = {}
  const after: Record<string, unknown> = { action: input.action }
  const action = input.action ?? ''

  if (action === 'leave-open') return { before, after: { action, leftOpen: true } }

  if (action === 'close-audit' || action === 'keep-both' || action === 'dismiss-duplicate') {
    if (input.auditId) await closeAudit(input.auditId, action === 'keep-both' ? 'APPROVED' : 'DISMISSED', before)
    return { before, after }
  }

  if ((action === 'set-coords' || action === 'set-centroid') && input.eventId) {
    const lat = Number(input.patch?.lat)
    const lng = Number(input.patch?.lng)
    before.event = await eventSnapshot(input.eventId)
    if (before.event && Number.isFinite(lat) && Number.isFinite(lng)) {
      await prisma.event.update({ where: { id: input.eventId }, data: { latitude: lat, longitude: lng } })
      after.latitude = lat
      after.longitude = lng
    }
    if (input.auditId) await closeAudit(input.auditId, 'APPROVED', before)
    return { before, after }
  }

  if (action === 'link-duplicate' && input.eventId && input.primaryId && input.primaryId !== input.eventId) {
    before.event = await eventSnapshot(input.eventId)
    const kept = await prisma.event.findUnique({ where: { id: input.primaryId }, select: { id: true, duplicateOfId: true } })
    if (kept && kept.duplicateOfId !== input.eventId && before.event && !before.event.duplicateOfId) {
      await prisma.event.update({ where: { id: input.eventId }, data: { duplicateOfId: input.primaryId } })
      after.duplicateOfId = input.primaryId
    }
    if (input.auditId) await closeAudit(input.auditId, 'APPROVED', before)
    if (input.reportId) await closeReport(input.reportId, 'RESOLVED', before)
    return { before, after }
  }

  if (action === 'publish' && input.eventId) {
    before.event = await eventSnapshot(input.eventId)
    await prisma.event.update({ where: { id: input.eventId }, data: { hidden: false, moderationStatus: 'approved' } })
    after.hidden = false
    after.moderationStatus = 'approved'
    return { before, after }
  }

  if (action === 'keep-hidden' && input.eventId) {
    before.event = await eventSnapshot(input.eventId)
    await prisma.event.update({ where: { id: input.eventId }, data: { hidden: true, moderationStatus: 'review' } })
    after.hidden = true
    return { before, after }
  }

  if (action === 'close-past' && input.eventId) {
    before.event = await eventSnapshot(input.eventId)
    after.unchanged = true
    return { before, after }
  }

  if (action === 'set-status' && input.eventId) {
    const status = String(input.patch?.status ?? '')
    before.event = await eventSnapshot(input.eventId)
    if (EVENT_STATUS.has(status)) {
      await prisma.event.update({ where: { id: input.eventId }, data: { status, statusSource: 'ops' } })
      after.status = status
    }
    if (input.reportId) await closeReport(input.reportId, 'RESOLVED', before)
    if (input.auditId) await closeAudit(input.auditId, 'APPROVED', before)
    return { before, after }
  }

  if (action === 'set-date' && input.eventId) {
    const date = String(input.patch?.date ?? '')
    before.event = await eventSnapshot(input.eventId)
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      await prisma.event.update({ where: { id: input.eventId }, data: { date: new Date(`${date}T00:00:00.000Z`) } })
      after.date = date
    }
    if (input.reportId) await closeReport(input.reportId, 'RESOLVED', before)
    return { before, after }
  }

  if (action === 'close-report-resolved' || action === 'close-report-dismissed') {
    if (input.reportId) await closeReport(input.reportId, action === 'close-report-resolved' ? 'RESOLVED' : 'DISMISSED', before)
    return { before, after }
  }

  if (action === 'approve-claim' && input.claimId) {
    if (input.claimKind === 'venue') {
      const claim = await prisma.venueClaimRequest.findUnique({ where: { id: input.claimId }, select: { id: true, status: true, reviewedAt: true, riskNote: true, venueId: true } })
      if (claim) {
        before.venueClaim = { id: claim.id, status: claim.status, reviewedAt: iso(claim.reviewedAt), riskNote: claim.riskNote }
        const venue = await prisma.venue.findUnique({ where: { id: claim.venueId }, select: { id: true, claimStatus: true } })
        if (venue) before.venue = { id: venue.id, claimStatus: venue.claimStatus }
      }
      const approved = await approveVenueClaim(input.claimId, null, 'Accepted automatically')
      after.approved = !!approved
      if (approved) {
        const grant = await prisma.venueManagementGrant.findFirst({
          where: { venueId: approved.venueId, status: 'APPROVED' },
          orderBy: { approvedAt: 'desc' },
          select: { id: true },
        })
        if (grant) after.grantId = grant.id
      }
      return { before, after }
    }
    const claim = await prisma.eventClaim.findUnique({
      where: { id: input.claimId },
      select: { id: true, status: true, reviewNote: true, reviewedAt: true, eventId: true, userId: true, user: { select: { id: true, role: true } } },
    })
    if (claim) {
      before.eventClaim = { id: claim.id, status: claim.status, reviewNote: claim.reviewNote, reviewedAt: iso(claim.reviewedAt) }
      before.claimUser = { id: claim.user.id, role: claim.user.role }
      before.event = await eventSnapshot(claim.eventId)
    }
    const approved = await approveClaim(input.claimId, 'Accepted automatically')
    after.approved = !!approved
    return { before, after }
  }

  if (action === 'reject-claim' && input.claimId) {
    if (input.claimKind === 'venue') {
      const claim = await prisma.venueClaimRequest.findUnique({ where: { id: input.claimId }, select: { id: true, status: true, reviewedAt: true, riskNote: true } })
      if (claim) before.venueClaim = { id: claim.id, status: claim.status, reviewedAt: iso(claim.reviewedAt), riskNote: claim.riskNote }
      await rejectVenueClaim(input.claimId, 'ops', 'Declined')
      return { before, after }
    }
    const claim = await prisma.eventClaim.findUnique({ where: { id: input.claimId }, select: { id: true, status: true, reviewNote: true, reviewedAt: true } })
    if (claim && claim.status === 'PENDING') {
      before.eventClaim = { id: claim.id, status: claim.status, reviewNote: claim.reviewNote, reviewedAt: iso(claim.reviewedAt) }
      await prisma.eventClaim.update({ where: { id: claim.id }, data: { status: 'REJECTED', reviewedAt: new Date(), reviewNote: 'Declined' } })
    }
    return { before, after }
  }

  if (action === 'request-evidence' && input.claimId && input.claimKind) {
    const note = 'Asked for evidence. No email was sent: a reply template is not approved yet.'
    if (input.claimKind === 'venue') {
      const claim = await prisma.venueClaimRequest.findUnique({ where: { id: input.claimId }, select: { id: true, status: true, reviewedAt: true, riskNote: true } })
      if (claim && claim.status === 'PENDING') {
        before.venueClaim = { id: claim.id, status: claim.status, reviewedAt: iso(claim.reviewedAt), riskNote: claim.riskNote }
        await prisma.venueClaimRequest.update({ where: { id: claim.id }, data: { status: 'EVIDENCE_REQUESTED', riskNote: note } })
      }
    } else {
      const claim = await prisma.eventClaim.findUnique({ where: { id: input.claimId }, select: { id: true, status: true, reviewNote: true, reviewedAt: true } })
      if (claim && claim.status === 'PENDING') {
        before.eventClaim = { id: claim.id, status: claim.status, reviewNote: claim.reviewNote, reviewedAt: iso(claim.reviewedAt) }
        await prisma.eventClaim.update({ where: { id: claim.id }, data: { status: 'EVIDENCE_REQUESTED', reviewNote: note } })
      }
    }
    await requestClaimEvidence({ email: input.email ?? null, claimId: input.claimId, kind: input.claimKind })
    return { before, after }
  }

  if (action === 'apply-venue-field' && input.changeId && input.venueId && input.field) {
    const field = input.field
    const allowed = SAFE_VENUE_FIELDS.has(field) || IMAGE_VENUE_FIELDS.has(field)
    const change = await prisma.venueProfileChange.findUnique({ where: { id: input.changeId }, select: { id: true, status: true, reviewedAt: true, proposedValue: true, fieldName: true } })
    if (change) before.venueChange = { id: change.id, status: change.status, reviewedAt: iso(change.reviewedAt) }
    if (allowed && change && change.fieldName === field) {
      const venue = await prisma.venue.findUnique({ where: { id: input.venueId } })
      if (venue) {
        const current = (venue as unknown as Record<string, unknown>)[field]
        before.venue = { id: venue.id, fields: { [field]: current == null ? null : String(current) } }
        const value = input.value ?? change.proposedValue
        await prisma.venue.update({ where: { id: input.venueId }, data: { [field]: value } as Prisma.VenueUpdateInput })
        await prisma.venueProfileChange.update({ where: { id: change.id }, data: { status: 'APPROVED', reviewedAt: new Date() } })
        after.field = field
      }
    }
    return { before, after }
  }

  if (action === 'reject-venue-change' && input.changeId) {
    const change = await prisma.venueProfileChange.findUnique({ where: { id: input.changeId }, select: { id: true, status: true, reviewedAt: true } })
    if (change && change.status === 'PENDING') {
      before.venueChange = { id: change.id, status: change.status, reviewedAt: iso(change.reviewedAt) }
      await prisma.venueProfileChange.update({ where: { id: change.id }, data: { status: 'REJECTED', reviewedAt: new Date() } })
    }
    return { before, after }
  }

  return { before, after }
}

async function closeReport(id: string, status: 'RESOLVED' | 'DISMISSED', before: Snapshot) {
  const row = await prisma.eventReport.findUnique({ where: { id }, select: { id: true, status: true, resolvedAt: true, email: true } })
  if (!row || row.status !== 'OPEN') return
  before.eventReport = { id: row.id, status: row.status, resolvedAt: iso(row.resolvedAt) }
  await prisma.eventReport.update({ where: { id }, data: { status, resolvedAt: new Date() } })
  await thankReporter({ email: row.email, reportId: row.id, outcome: status })
}

/** Puts a snapshot back. Used by the 30-day undo. */
export async function restoreSnapshot(snapshot: Snapshot): Promise<void> {
  if (snapshot.qualityAudit) {
    await prisma.qualityAudit.update({
      where: { id: snapshot.qualityAudit.id },
      data: {
        status: snapshot.qualityAudit.status,
        reviewedAt: snapshot.qualityAudit.reviewedAt ? new Date(snapshot.qualityAudit.reviewedAt) : null,
      },
    }).catch(() => {})
  }
  if (snapshot.event) {
    const event = snapshot.event
    await prisma.event.update({
      where: { id: event.id },
      data: {
        duplicateOfId: event.duplicateOfId,
        latitude: event.latitude,
        longitude: event.longitude,
        hidden: event.hidden,
        moderationStatus: event.moderationStatus,
        status: event.status,
        date: new Date(event.date),
        promoterId: event.promoterId,
      },
    }).catch(() => {})
  }
  if (snapshot.eventReport) {
    await prisma.eventReport.update({
      where: { id: snapshot.eventReport.id },
      data: {
        status: snapshot.eventReport.status,
        resolvedAt: snapshot.eventReport.resolvedAt ? new Date(snapshot.eventReport.resolvedAt) : null,
      },
    }).catch(() => {})
  }
  if (snapshot.eventClaim) {
    await prisma.eventClaim.update({
      where: { id: snapshot.eventClaim.id },
      data: {
        status: snapshot.eventClaim.status,
        reviewNote: snapshot.eventClaim.reviewNote,
        reviewedAt: snapshot.eventClaim.reviewedAt ? new Date(snapshot.eventClaim.reviewedAt) : null,
      },
    }).catch(() => {})
  }
  if (snapshot.claimUser) {
    await prisma.user.update({ where: { id: snapshot.claimUser.id }, data: { role: snapshot.claimUser.role } }).catch(() => {})
  }
  if (snapshot.venueClaim) {
    await prisma.venueClaimRequest.update({
      where: { id: snapshot.venueClaim.id },
      data: {
        status: snapshot.venueClaim.status,
        riskNote: snapshot.venueClaim.riskNote,
        reviewedAt: snapshot.venueClaim.reviewedAt ? new Date(snapshot.venueClaim.reviewedAt) : null,
      },
    }).catch(() => {})
  }
  if (snapshot.venue?.claimStatus) {
    await prisma.venue.update({ where: { id: snapshot.venue.id }, data: { claimStatus: snapshot.venue.claimStatus } }).catch(() => {})
  }
  if (snapshot.venue?.fields) {
    await prisma.venue.update({ where: { id: snapshot.venue.id }, data: snapshot.venue.fields }).catch(() => {})
  }
  if (snapshot.venueChange) {
    await prisma.venueProfileChange.update({
      where: { id: snapshot.venueChange.id },
      data: {
        status: snapshot.venueChange.status,
        reviewedAt: snapshot.venueChange.reviewedAt ? new Date(snapshot.venueChange.reviewedAt) : null,
      },
    }).catch(() => {})
  }
  if (snapshot.grantId) {
    await prisma.venueManagementGrant.update({
      where: { id: snapshot.grantId },
      data: { status: 'REVOKED', revokedAt: new Date() },
    }).catch(() => {})
  }
}
