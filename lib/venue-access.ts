/**
 * Server-side venue management. Every protected action calls canManageVenue.
 * Event editing is never decided here.
 */
import { randomBytes, randomInt } from 'crypto'
import { prisma } from '@/lib/db'
import { sendEmail, escapeHtml } from '@/lib/email'
import { emailBodyCell, emailDocument } from '@/lib/email-brand'
import { notifyTrustTeam } from '@/lib/trust'
import { siteUrl } from '@/lib/site-url'
import { ACKNOWLEDGEMENT_OF_COUNTRY } from '@/lib/cities'
import { sydneyToday } from '@/lib/event-store'
import { venueKey as followKey } from '@/lib/together'
import { canManageEvent } from '@/lib/event-overrides'
import {
  ANALYTICS_CAVEAT,
  SPONSORED_LABEL,
  applyVenueReport,
  assessVenueClaim,
  claimRateLimited,
  codeRateLimited,
  domainAloneInsufficient,
  evaluateVenueAccess,
  profileCompleteness,
  reportRateLimited,
  splitVenuePatch,
  validateVenueFields,
  venueAnalyticsView,
  venueProduct,
  venueRoleAllows,
  type VenueAction,
} from '@/lib/ownership'
import { CODE_MINUTES, assessCode, hashVerificationSecret } from '@/lib/email-code'

function pepper(): string {
  return process.env.OWNERSHIP_CODE_PEPPER || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'vibepeep-ownership'
}

function missingRelation(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === 'P2021' || code === 'P2022'
}

async function audit(venueId: string, actorId: string | null, action: string, previousValue?: string | null, updatedValue?: string | null) {
  await prisma.venueAuditLog.create({
    data: {
      venueId,
      actorId,
      action,
      previousValue: previousValue?.slice(0, 4000) ?? null,
      updatedValue: updatedValue?.slice(0, 4000) ?? null,
    },
  }).catch((err) => console.error('venue audit failed', (err as { message?: string })?.message))
}

export async function canManageVenue(userId: string, venueId: string) {
  let memberships: { userId: string; organisationId: string; role: string; status: string; revokedAt: Date | null }[] = []
  let grants: { venueId: string; organisationId: string; permissionScope: string; status: string; revokedAt: Date | null }[] = []
  try {
    memberships = await prisma.organisationMembership.findMany({
      where: { userId },
      select: { userId: true, organisationId: true, role: true, status: true, revokedAt: true },
    })
    const orgIds = memberships.map((row) => row.organisationId)
    grants = orgIds.length
      ? await prisma.venueManagementGrant.findMany({
        where: { venueId, organisationId: { in: orgIds } },
        select: { venueId: true, organisationId: true, permissionScope: true, status: true, revokedAt: true },
      })
      : []
  } catch (err) {
    if (!missingRelation(err)) throw err
  }
  return evaluateVenueAccess({ userId, venueId, memberships, grants })
}

async function requireAction(userId: string, venueId: string, action: VenueAction) {
  const access = await canManageVenue(userId, venueId)
  if (!access.allowed || !venueRoleAllows(access.role, action)) return { access, error: 'You don’t manage this venue.' as const }
  return { access, error: null }
}

const publicSelect = {
  id: true, name: true, city: true, address: true, website: true, description: true, contactEmail: true, contactPhone: true,
  instagram: true, facebook: true, categories: true, facilities: true, accessibilityInfo: true, logoUrl: true, photos: true,
  announcement: true, claimStatus: true, openTime: true, closeTime: true, latitude: true, longitude: true, officialDomain: true,
} as const

export async function publicVenue(id: string) {
  const venue = await prisma.venue.findUnique({ where: { id }, select: publicSelect })
  if (!venue) return null
  const { officialDomain: _domain, ...rest } = venue
  return { ...rest, completeness: profileCompleteness(venue), managed: venue.claimStatus === 'CLAIMED' }
}

export async function submitVenueClaim(user: { id: string; email: string; name: string; role: string }, venueId: string, body: Record<string, unknown>) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId } })
  if (!venue) return { status: 404 as const, error: 'Venue not found' }
  const since = new Date(Date.now() - 24 * 3600_000)
  const recent = await prisma.venueClaimRequest.count({ where: { claimantUserId: user.id, submittedAt: { gt: since } } })
  if (claimRateLimited(recent)) return { status: 429 as const, error: 'That’s a lot of claims for one day. Try again tomorrow.' }

  const fullName = String(body.fullName || user.name || '').trim().slice(0, 120)
  const roleAtVenue = String(body.roleAtVenue || '').trim().slice(0, 120) || null
  const businessEmail = String(body.businessEmail || user.email || '').trim().toLowerCase().slice(0, 180)
  const evidenceReference = String(body.evidenceReference || '').trim().slice(0, 500) || null
  if (!fullName || !businessEmail.includes('@')) return { status: 400 as const, error: 'Add your name and a business email.' }

  const mine = await canManageVenue(user.id, venueId)
  if (mine.allowed) return { status: 200 as const, statusText: 'APPROVED', already: true }

  const membership = await prisma.organisationMembership.findFirst({
    where: { userId: user.id, status: 'ACTIVE', organisation: { verificationStatus: 'VERIFIED', organisationType: 'VENUE' } },
    include: { organisation: true },
  })
  const linked = membership
    ? await prisma.venueManagementGrant.findFirst({ where: { organisationId: membership.organisationId, venueId, status: 'APPROVED' } })
    : null
  const decision = assessVenueClaim({
    officialDomain: venue.officialDomain,
    applicantEmail: businessEmail,
    applicantWebsite: typeof body.website === 'string' ? body.website : null,
    existingVerifiedOrgRelationship: !!linked,
    claimedByOther: venue.claimStatus === 'CLAIMED',
    largeOrganisation: !!(venue.officialDomain && domainAloneInsufficient(venue.officialDomain)),
    aiScore: typeof body.aiScore === 'number' ? body.aiScore : null,
  })

  if (decision.outcome === 'DISPUTE' || venue.claimStatus === 'CLAIMED') {
    const claim = await prisma.venueClaimRequest.create({
      data: {
        venueId,
        claimantUserId: user.id,
        fullName,
        roleAtVenue,
        businessEmail,
        verificationMethod: 'MANUAL',
        evidenceReference,
        status: 'DISPUTE',
        riskNote: 'Existing manager. This request does not grant access.',
      },
    })
    await audit(venueId, user.id, 'dispute', null, claim.id)
    await notifyTrustTeam(`Venue dispute: ${venue.name}`, [['Venue', venue.name], ['From', `${fullName} <${businessEmail}>`], ['Note', evidenceReference]])
    return { status: 200 as const, statusText: 'DISPUTE', claimId: claim.id }
  }

  const org = linked && membership
    ? membership.organisation
    : await prisma.organisation.create({
      data: {
        name: venue.name,
        organisationType: 'VENUE',
        verificationStatus: 'PENDING',
        memberships: { create: { userId: user.id, role: 'ADMINISTRATOR', status: 'PENDING' } },
      },
    })

  const claim = await prisma.venueClaimRequest.create({
    data: {
      venueId,
      claimantUserId: user.id,
      claimantOrganisationId: org.id,
      fullName,
      roleAtVenue,
      businessEmail,
      verificationMethod: decision.method === 'TRUSTED_SOURCE' ? 'MANUAL' : decision.method,
      evidenceReference,
      status: 'PENDING',
      riskNote: decision.reason,
    },
  })
  await prisma.venue.update({ where: { id: venueId }, data: { claimStatus: venue.claimStatus === 'UNCLAIMED' ? 'PENDING' : venue.claimStatus } })

  if (decision.outcome === 'APPROVE') {
    await approveVenueClaim(claim.id, user.id, decision.reason)
    return { status: 200 as const, statusText: 'APPROVED', claimId: claim.id }
  }
  if (decision.outcome === 'EMAIL_CHALLENGE') {
    const sent = await issueCode('VENUE_CLAIM', claim.id, businessEmail, venue.name)
    return { status: 200 as const, statusText: 'PENDING', claimId: claim.id, emailSent: sent.emailSent, emailError: sent.emailError }
  }
  await notifyTrustTeam(`Venue claim to review: ${venue.name}`, [
    ['Venue', `${venue.name}, ${venue.city}`],
    ['Claimant', `${fullName} <${businessEmail}>`],
    ['Role', roleAtVenue],
    ['Evidence', evidenceReference],
    ['Why', decision.reason],
  ])
  return { status: 200 as const, statusText: 'PENDING', claimId: claim.id }
}

async function issueCode(purpose: string, subjectId: string, email: string, label: string) {
  const hourAgo = new Date(Date.now() - 3600_000)
  const recent = await prisma.emailVerificationCode.count({ where: { email, createdAt: { gt: hourAgo } } })
  if (codeRateLimited(recent)) return { emailSent: false, emailError: 'That inbox already has a fresh code. Wait a bit, then ask again.' }
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60 * 1000)
  await prisma.emailVerificationCode.create({
    data: {
      purpose,
      subjectId,
      email,
      codeHash: hashVerificationSecret(code, pepper()),
      tokenHash: hashVerificationSecret(token, pepper()),
      expiresAt,
    },
  })
  const link = `${siteUrl()}/venues/verify?token=${token}`
  const home = siteUrl()
  const html = emailDocument({
    title: `Your VibePeep code for ${label}`.slice(0, 120),
    preheader: `Confirm you can manage ${label}`,
    manageHref: `${home}/account`,
    homeHref: home,
    reason: 'Opening the link shows you can read this inbox. It does not by itself decide ownership when a person still needs to review the claim.',
    rows: emailBodyCell(`<p style="margin:0 0 12px;">Confirm you can manage <strong>${escapeHtml(label)}</strong>.</p>
    <p style="font-size:32px;letter-spacing:0.2em;font-weight:700;margin:0 0 12px;">${escapeHtml(code)}</p>
    <p style="margin:0 0 12px;"><a href="${escapeHtml(link)}">Or open this one-time link</a>. It expires in ${CODE_MINUTES} minutes and works once.</p>
    <p style="font-size:13px;margin:0 0 12px;">Opening the link shows you can read this inbox. It does not by itself decide ownership when a person still needs to review the claim.</p>
    <p style="font-size:12px;margin:0;"><strong>Acknowledgement of Country.</strong> ${escapeHtml(ACKNOWLEDGEMENT_OF_COUNTRY)}</p>`),
  })
  const sent = await sendEmail({
    to: email,
    subject: `Your VibePeep code for ${label}`.slice(0, 120),
    html,
    text: `Your VibePeep code is ${code}\n\nConfirm: ${link}\n\nIt expires in ${CODE_MINUTES} minutes.\n\nAcknowledgement of Country. ${ACKNOWLEDGEMENT_OF_COUNTRY}`,
  })
  return { emailSent: sent.ok, emailError: sent.ok ? null : 'We couldn’t send the code just now.' }
}

export async function verifyVenueCode(input: { code?: string | null; token?: string | null; claimId?: string | null }) {
  const now = new Date()
  const token = input.token?.trim()
  const code = input.code?.trim()
  let row = token
    ? await prisma.emailVerificationCode.findUnique({ where: { tokenHash: hashVerificationSecret(token, pepper()) } })
    : null
  if (!row && input.claimId && code) {
    row = await prisma.emailVerificationCode.findFirst({
      where: { purpose: 'VENUE_CLAIM', subjectId: input.claimId, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    })
  }
  const verdict = assessCode(row, { code, token, pepper: pepper() }, now)
  if (!row || verdict === 'missing') return { status: 400 as const, error: 'That code doesn’t match. Ask for a fresh one.' }
  if (verdict === 'expired' || verdict === 'used') return { status: 400 as const, error: 'That link has expired. Ask for a fresh code.' }
  if (verdict === 'locked') return { status: 400 as const, error: 'Too many tries. Ask for a fresh code.' }
  if (verdict === 'mismatch') {
    await prisma.emailVerificationCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } })
    return { status: 400 as const, error: 'That code doesn’t match.' }
  }
  await prisma.emailVerificationCode.update({ where: { id: row.id }, data: { usedAt: now } })
  if (row.purpose !== 'VENUE_CLAIM') return { status: 400 as const, error: 'That code is for something else.' }
  const claim = await prisma.venueClaimRequest.findUnique({ where: { id: row.subjectId }, include: { venue: true } })
  if (!claim || claim.status === 'REJECTED') return { status: 400 as const, error: 'This claim is no longer open.' }
  const decision = assessVenueClaim({
    officialDomain: claim.venue.officialDomain,
    applicantEmail: claim.businessEmail,
    emailProved: true,
    claimedByOther: claim.venue.claimStatus === 'CLAIMED',
    largeOrganisation: !!(claim.venue.officialDomain && domainAloneInsufficient(claim.venue.officialDomain)),
  })
  if (decision.outcome !== 'APPROVE') {
    await prisma.venueClaimRequest.update({ where: { id: claim.id }, data: { riskNote: decision.reason } })
    await notifyTrustTeam(`Venue email proved, still needs review: ${claim.venue.name}`, [['Claim', claim.id], ['Why', decision.reason]])
    return { status: 200 as const, statusText: 'PENDING', claimId: claim.id }
  }
  await approveVenueClaim(claim.id, claim.claimantUserId, decision.reason)
  return { status: 200 as const, statusText: 'APPROVED', claimId: claim.id, venueId: claim.venueId }
}

export async function approveVenueClaim(claimId: string, actorId: string | null, note: string) {
  const claim = await prisma.venueClaimRequest.findUnique({ where: { id: claimId } })
  if (!claim) return null
  const orgId = claim.claimantOrganisationId
  if (!orgId) return null
  const other = await prisma.venueManagementGrant.findFirst({
    where: { venueId: claim.venueId, status: 'APPROVED', revokedAt: null, organisationId: { not: orgId } },
    select: { id: true },
  })
  if (other) {
    await prisma.venueClaimRequest.update({ where: { id: claim.id }, data: { status: 'DISPUTE', reviewedAt: new Date(), riskNote: 'Another organisation already manages this venue.' } })
    return null
  }
  const now = new Date()
  const existingGrant = await prisma.venueManagementGrant.findFirst({ where: { venueId: claim.venueId, organisationId: orgId, status: 'APPROVED', revokedAt: null } })
  await prisma.$transaction([
    prisma.venueClaimRequest.update({ where: { id: claim.id }, data: { status: 'APPROVED', reviewedAt: now, riskNote: note } }),
    prisma.organisation.update({ where: { id: orgId }, data: { verificationStatus: 'VERIFIED', organisationType: 'VENUE' } }),
    prisma.organisationMembership.updateMany({ where: { organisationId: orgId, userId: claim.claimantUserId }, data: { status: 'ACTIVE', role: 'ADMINISTRATOR', revokedAt: null } }),
    ...(existingGrant ? [] : [prisma.venueManagementGrant.create({ data: { venueId: claim.venueId, organisationId: orgId, permissionScope: 'ADMINISTRATOR', status: 'APPROVED', approvedAt: now } })]),
    prisma.venue.update({ where: { id: claim.venueId }, data: { claimStatus: 'CLAIMED' } }),
    prisma.user.updateMany({ where: { id: claim.claimantUserId, role: 'CONSUMER' }, data: { role: 'PROMOTER' } }),
  ])
  await audit(claim.venueId, actorId, 'claim-approved', null, claim.id)
  return claim
}

export async function rejectVenueClaim(claimId: string, actorId: string, note: string) {
  const claim = await prisma.venueClaimRequest.findUnique({ where: { id: claimId } })
  if (!claim) return null
  await prisma.venueClaimRequest.update({ where: { id: claim.id }, data: { status: 'REJECTED', reviewedAt: new Date(), riskNote: note } })
  const still = await prisma.venueClaimRequest.count({ where: { venueId: claim.venueId, status: { in: ['PENDING', 'DISPUTE'] } } })
  const approved = await prisma.venueManagementGrant.count({ where: { venueId: claim.venueId, status: 'APPROVED' } })
  if (!still && !approved) await prisma.venue.update({ where: { id: claim.venueId }, data: { claimStatus: 'UNCLAIMED' } })
  await audit(claim.venueId, actorId, 'claim-rejected', null, note)
  return claim
}

export async function updateVenue(userId: string, venueId: string, body: Record<string, unknown>) {
  const gate = await requireAction(userId, venueId, 'editProfile')
  if (gate.error || !gate.access.role) return { status: gate.access.allowed ? 403 : 403, error: gate.error ?? 'Not allowed' }
  const parsed = validateVenueFields(body)
  if (!parsed.ok) return { status: 400 as const, error: parsed.error }
  const venue = await prisma.venue.findUnique({ where: { id: venueId } })
  if (!venue) return { status: 404 as const, error: 'Venue not found' }
  const split = splitVenuePatch(parsed.fields)
  const data: Record<string, unknown> = {}
  if ('name' in split.immediate && split.immediate.name) data.name = split.immediate.name
  if ('description' in split.immediate) data.description = split.immediate.description
  if ('contactEmail' in split.immediate) data.contactEmail = split.immediate.contactEmail
  if ('contactPhone' in split.immediate) data.contactPhone = split.immediate.contactPhone
  if ('instagram' in split.immediate) data.instagram = split.immediate.instagram
  if ('facebook' in split.immediate) data.facebook = split.immediate.facebook
  if ('accessibilityInfo' in split.immediate) data.accessibilityInfo = split.immediate.accessibilityInfo
  if ('announcement' in split.immediate) data.announcement = split.immediate.announcement
  if ('logoUrl' in split.immediate) data.logoUrl = split.immediate.logoUrl
  if ('categories' in split.immediate && split.immediate.categories) data.categories = split.immediate.categories.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8)
  if ('facilities' in split.immediate && split.immediate.facilities) data.facilities = split.immediate.facilities.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 12)
  if ('openingHours' in split.immediate && split.immediate.openingHours) {
    const match = split.immediate.openingHours.match(/(\d{2}:\d{2})\s*[-–to]+\s*(\d{2}:\d{2})/)
    if (!match) return { status: 400 as const, error: 'Hours look like 17:00-23:00.' }
    data.openTime = match[1]
    data.closeTime = match[2]
  }
  if (Object.keys(data).length) {
    await prisma.venue.update({ where: { id: venueId }, data })
    await audit(venueId, userId, 'profile-edit', null, Object.keys(data).join(', '))
  }
  const reviewIds: string[] = []
  if (Object.keys(split.review).length) {
    if (!venueRoleAllows(gate.access.role, 'editSensitive')) {
      return { status: 200 as const, ok: true, saved: Object.keys(data), review: [] as string[], warning: 'Address, legal name and the official website need an administrator.' }
    }
    for (const [fieldName, proposedValue] of Object.entries(split.review)) {
      if (proposedValue == null) continue
      const row = await prisma.venueProfileChange.create({ data: { venueId, actorId: userId, fieldName, proposedValue } })
      reviewIds.push(row.id)
    }
    await audit(venueId, userId, 'profile-review', null, Object.keys(split.review).join(', '))
  }
  return { status: 200 as const, ok: true, saved: Object.keys(data), review: reviewIds }
}

export async function venueEvents(userId: string, venueId: string, isAdmin = false) {
  const gate = await requireAction(userId, venueId, 'viewEvents')
  if (gate.error) return { status: 403 as const, error: gate.error }
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true, name: true, city: true } })
  if (!venue) return { status: 404 as const, error: 'Venue not found' }
  const today = sydneyToday()
  const rows = await prisma.event.findMany({
    where: {
      date: { gte: today },
      duplicateOfId: null,
      OR: [{ venueId }, { venueName: venue.name, city: venue.city }],
    },
    orderBy: { date: 'asc' },
    take: 80,
    select: {
      id: true, title: true, date: true, time: true, endTime: true, imageUrl: true, category: true, status: true,
      organiserName: true, source: true, sourceUrl: true, ticketUrl: true, promoterId: true, venueId: true,
      promoter: { select: { id: true, name: true, orgName: true } },
    },
  })
  const events = []
  for (const row of rows) {
    const manage = await canManageEvent(userId, row.id, isAdmin)
    events.push({
      id: row.id,
      title: row.title,
      date: row.date.toISOString(),
      time: row.time,
      endTime: row.endTime,
      imageUrl: row.imageUrl,
      category: row.category,
      status: row.status,
      organiserName: row.promoter?.orgName || row.promoter?.name || row.organiserName,
      source: row.source,
      publicPath: `/events/${row.id}`,
      canEdit: manage.access.allowed,
    })
  }
  return { status: 200 as const, events }
}

export async function reportVenueEvent(userId: string, venueId: string, body: Record<string, unknown>) {
  const gate = await requireAction(userId, venueId, 'reportEvent')
  if (gate.error) return { status: 403 as const, error: gate.error }
  const eventId = String(body.eventId || '')
  const reason = String(body.reason || '')
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, title: true, status: true, promoterId: true, promoter: { select: { email: true } } } })
  if (!event) return { status: 404 as const, error: 'Event not found' }
  const open = await prisma.venueEventReport.count({ where: { venueId, eventId, reporterUserId: userId, status: { in: ['OPEN', 'IN_REVIEW'] } } })
  if (reportRateLimited(open)) return { status: 429 as const, error: 'That report is already with the team.' }
  const effect = applyVenueReport({ reason, event })
  const report = await prisma.venueEventReport.create({
    data: {
      venueId,
      eventId,
      reporterUserId: userId,
      reason,
      details: String(body.details || '').slice(0, 2000) || null,
      status: 'IN_REVIEW',
      caution: effect.caution,
    },
  })
  await audit(venueId, userId, 'event-report', event.title, reason)
  if (event.promoter?.email) {
    await sendEmail({
      to: event.promoter.email,
      subject: `A venue asked us to check ${event.title}`.slice(0, 120),
      html: emailDocument({
        title: `A venue asked us to check ${event.title}`.slice(0, 120),
        preheader: 'The listing is unchanged while we check it.',
        manageHref: `${siteUrl()}/account`,
        homeHref: siteUrl(),
        rows: emailBodyCell(`<p style="margin:0;">A venue representative reported “${escapeHtml(event.title)}”. The listing is unchanged while we check it.</p>`),
      }),
      text: `A venue reported “${event.title}”. The listing is unchanged while we check it.`,
    })
  }
  await notifyTrustTeam(`Venue report: ${event.title}`, [['Reason', reason], ['Event', event.id], ['Venue', venueId]])
  const after = await prisma.event.findUnique({ where: { id: eventId }, select: { title: true, status: true, date: true } })
  return { status: 200 as const, ok: true, reportId: report.id, unchanged: after?.title === event.title && after?.status === event.status }
}

function periodStart(preset: string, from?: string | null): Date {
  const now = new Date()
  if (preset === 'custom' && from) return new Date(`${from.slice(0, 10)}T00:00:00.000Z`)
  const days = preset === '90' ? 90 : preset === '30' ? 30 : 7
  return new Date(now.getTime() - days * 86400000)
}

export async function venueAnalytics(userId: string, venueId: string, preset: string, from?: string | null, to?: string | null) {
  const gate = await requireAction(userId, venueId, 'viewAnalytics')
  if (gate.error) return { status: 403 as const, error: gate.error }
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { key: true, name: true, city: true } })
  if (!venue) return { status: 404 as const, error: 'Venue not found' }
  const start = periodStart(preset, from)
  const end = to ? new Date(`${to.slice(0, 10)}T23:59:59.000Z`) : new Date()
  const startKey = start.toISOString().slice(0, 10)
  const endKey = end.toISOString().slice(0, 10)
  const [rows, saves, events] = await Promise.all([
    prisma.venueAnalyticsAggregate.findMany({ where: { venueId, period: { gte: startKey, lte: endKey } } }),
    prisma.venueFollow.count({ where: { venueKey: { in: [venue.key, followKey(venue.name, venue.city)] } } }),
    prisma.event.findMany({ where: { venueId, duplicateOfId: null }, select: { views: true, date: true, title: true, id: true } }),
  ])
  const sum = (metric: string) => rows.filter((row) => row.metricType === metric).reduce((total, row) => total + row.value, 0)
  const upcoming = events.filter((event) => event.date >= sydneyToday()).length
  const view = venueAnalyticsView({
    profileViews: sum('PROFILE_VIEWS'),
    websiteClicks: sum('WEBSITE_CLICKS'),
    directionsClicks: sum('DIRECTIONS_CLICKS'),
    shares: sum('SHARES'),
    saves,
    upcomingEvents: upcoming,
    eventViews: events.reduce((total, event) => total + event.views, 0),
  })
  const mostViewed = [...events].sort((a, b) => b.views - a.views).slice(0, 5).map((event) => ({ id: event.id, title: event.title, views: event.views }))
  return { status: 200 as const, analytics: view, mostViewed, caveat: ANALYTICS_CAVEAT, range: { from: startKey, to: endKey } }
}

export async function bumpVenueMetric(venueId: string, metricType: string) {
  const allowed = ['PROFILE_VIEWS', 'WEBSITE_CLICKS', 'DIRECTIONS_CLICKS', 'SHARES']
  if (!allowed.includes(metricType)) return
  const period = new Date().toISOString().slice(0, 10)
  await prisma.venueAnalyticsAggregate.upsert({
    where: { venueId_period_metricType: { venueId, period, metricType } },
    create: { venueId, period, metricType, value: 1 },
    update: { value: { increment: 1 } },
  })
}

export async function venueTeam(userId: string, venueId: string) {
  const gate = await requireAction(userId, venueId, 'viewEvents')
  if (gate.error) return { status: 403 as const, error: gate.error }
  const grants = await prisma.venueManagementGrant.findMany({
    where: { venueId, status: 'APPROVED', revokedAt: null },
    select: { organisationId: true, permissionScope: true },
  })
  const orgIds = grants.map((grant) => grant.organisationId)
  const members = orgIds.length
    ? await prisma.organisationMembership.findMany({
      where: { organisationId: { in: orgIds } },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    : []
  return {
    status: 200 as const,
    role: gate.access.role,
    members: members.map((member) => ({
      id: member.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      status: member.status,
      revokedAt: member.revokedAt?.toISOString() ?? null,
    })),
  }
}

export async function inviteVenueManager(actorId: string, venueId: string, email: string) {
  const gate = await requireAction(actorId, venueId, 'manageTeam')
  if (gate.error || !gate.access.organisationId) return { status: 403 as const, error: 'Only a venue administrator can add people.' }
  const person = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, email: true } })
  if (!person) return { status: 404 as const, error: 'They need a VibePeep account first. Claiming stays free.' }
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { officialDomain: true } })
  const domainOk = !!venue?.officialDomain && person.email.toLowerCase().endsWith(`@${venue.officialDomain.toLowerCase()}`)
  const status = domainOk ? 'ACTIVE' : 'PENDING'
  const member = await prisma.organisationMembership.upsert({
    where: { userId_organisationId: { userId: person.id, organisationId: gate.access.organisationId } },
    create: { userId: person.id, organisationId: gate.access.organisationId, role: 'MANAGER', status },
    update: { role: 'MANAGER', status, revokedAt: null },
  })
  await audit(venueId, actorId, 'team-invite', null, `${person.email} ${status}`)
  return { status: 200 as const, memberId: member.id, memberStatus: status }
}

export async function revokeVenueMember(actorId: string, venueId: string, membershipId: string) {
  const gate = await requireAction(actorId, venueId, 'manageTeam')
  if (gate.error) return { status: 403 as const, error: 'Only a venue administrator can remove people.' }
  const member = await prisma.organisationMembership.findUnique({ where: { id: membershipId } })
  if (!member || member.organisationId !== gate.access.organisationId) return { status: 404 as const, error: 'That person isn’t on this venue.' }
  if (member.role === 'ADMINISTRATOR' && member.userId === actorId) return { status: 400 as const, error: 'Ask another administrator before leaving. Ownership transfer is reviewed.' }
  const now = new Date()
  await prisma.organisationMembership.update({ where: { id: member.id }, data: { status: 'REVOKED', revokedAt: now } })
  await audit(venueId, actorId, 'team-revoke', member.userId, now.toISOString())
  const still = await canManageVenue(member.userId, venueId)
  return { status: 200 as const, revoked: !still.allowed }
}

export async function startVenuePlacement(userId: string, venueId: string, productId: string) {
  const gate = await requireAction(userId, venueId, 'configureAds')
  if (gate.error) return { status: 403 as const, error: gate.error }
  const product = venueProduct(productId)
  if (!product) return { status: 400 as const, error: 'Choose a placement.' }
  const orderId = randomBytes(16).toString('hex')
  const row = await prisma.venuePlacement.create({
    data: {
      venueId,
      userId,
      product: product.id,
      days: product.days,
      orderId,
      amountCents: product.priceCents,
      paymentMode: process.env.STRIPE_SECRET_KEY ? 'stripe' : 'test',
    },
  })
  return { status: 200 as const, placement: row, product, orderId, label: SPONSORED_LABEL }
}

export async function activateVenueOrder(orderId: string) {
  const rows = await prisma.venuePlacement.findMany({ where: { orderId, status: 'PENDING' } })
  const now = new Date()
  for (const row of rows) {
    await prisma.venuePlacement.update({
      where: { id: row.id },
      data: { status: 'ACTIVE', startsAt: now, endsAt: new Date(now.getTime() + row.days * 86400000) },
    })
    await audit(row.venueId, row.userId, 'placement', null, `${row.product} ${SPONSORED_LABEL}`)
  }
  return rows.length
}

export async function managedVenueIds(userId: string): Promise<string[]> {
  const memberships = await prisma.organisationMembership.findMany({
    where: { userId, status: 'ACTIVE', revokedAt: null, role: { in: ['ADMINISTRATOR', 'MANAGER'] } },
    select: { organisationId: true, role: true, userId: true, status: true, revokedAt: true },
  })
  if (!memberships.length) return []
  const grants = await prisma.venueManagementGrant.findMany({
    where: { organisationId: { in: memberships.map((row) => row.organisationId) }, status: 'APPROVED', revokedAt: null },
    select: { venueId: true, organisationId: true, permissionScope: true, status: true, revokedAt: true },
  })
  const ids = new Set<string>()
  for (const grant of grants) {
    if (evaluateVenueAccess({ userId, venueId: grant.venueId, memberships, grants }).allowed) ids.add(grant.venueId)
  }
  return [...ids]
}
