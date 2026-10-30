/**
 * Community hub server actions: submit, verify, edit, moderate, count.
 * Mail goes through lib/email.ts. Nothing here invents a From address.
 */
import { cache } from 'react'
import { createHash, randomBytes, randomInt } from 'crypto'
import { prisma } from '@/lib/db'
import { sendEmail, emailSendingEnabled } from '@/lib/email'
import { siteUrl } from '@/lib/site-url'
import { cityDef, CITIES, ACKNOWLEDGEMENT_OF_COUNTRY } from '@/lib/cities'
import { eventPath, citySlug, cityToday, addDaysKey } from '@/lib/seo'
import { makeSeriesKey } from '@/lib/event-store'
import {
  COMMUNITY_HOLD_REPORTS, COMMUNITY_SECTIONS, communityCityPath, communityPageIndexable, communityPlacePath, communitySectionPath,
  defaultWindow, filterCommunityListings, isWhenKey, moderationResult, overRateLimit, parseCommunity, sectionByKey, suburbMatches,
  type CommunityInput, type CommunityOccurrence, type CommunityPageKind,
} from '@/lib/community-shared'

const CODE_MINUTES = 30
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c))

export function communityIpHash(req: Request): string {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
  return createHash('sha256').update(`vibepeep-community:${ip}`).digest('hex').slice(0, 32)
}

function pepper(): string {
  return process.env.COMMUNITY_CODE_PEPPER || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'vibepeep-community'
}

export function hashCommunitySecret(value: string): string {
  return createHash('sha256').update(`${pepper()}:${value}`).digest('hex')
}

async function audit(eventId: string, action: string, detail?: string | null, actorId?: string | null) {
  await prisma.communityAudit.create({
    data: { eventId, action, detail: detail?.slice(0, 2000) ?? null, actorId: actorId ?? null },
  })
}

async function metric(kind: string, bits: { city?: string | null; suburb?: string | null; category?: string | null; path?: string | null }) {
  await prisma.communityMetric.create({
    data: { kind, city: bits.city ?? null, suburb: bits.suburb ?? null, category: bits.category ?? null, path: bits.path ?? null },
  }).catch((err: { message?: string }) => console.error('community metric failed', err?.message))
}

function venueFor(input: CommunityInput): { venueName: string; venueAddress: string | null } {
  const venueName = input.placeName || input.suburb
  const venueAddress = input.locationVisibility === 'PRECISE' ? input.streetAddress : null
  return { venueName, venueAddress }
}

function infoHref(input: Pick<CommunityInput, 'websiteUrl'>, id: string, title: string): string {
  return input.websiteUrl || eventPath({ id, title })
}

async function sendCodeMail(to: string, code: string, token: string, title: string) {
  const link = `${siteUrl()}/local/verify?token=${token}`
  const html = `<div style="font-family:Georgia,serif;color:#1c1c1e;line-height:1.5">
    <p style="font-size:18px">Your listing “${esc(title)}” is one code away from the neighbourhood.</p>
    <p style="font-size:32px;letter-spacing:0.2em;font-weight:700">${esc(code)}</p>
    <p><a href="${esc(link)}">Or tap this link to confirm</a>. It expires in ${CODE_MINUTES} minutes.</p>
    <p style="font-size:13px;color:#555">The code is only for you. VibePeep won’t show your email on the listing.</p>
    <p style="font-size:12px;color:#666"><strong>Acknowledgement of Country.</strong> ${esc(ACKNOWLEDGEMENT_OF_COUNTRY)}</p>
  </div>`
  const text = `Your VibePeep code is ${code}\n\nConfirm: ${link}\n\nIt expires in ${CODE_MINUTES} minutes. Your email stays off the public listing.\n\nAcknowledgement of Country. ${ACKNOWLEDGEMENT_OF_COUNTRY}`
  return sendEmail({ to, subject: 'Your VibePeep code is in', html, text })
}

async function issueCode(eventId: string, email: string, title: string) {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60 * 1000)
  await prisma.communityCode.create({
    data: { email, eventId, codeHash: hashCommunitySecret(code), tokenHash: hashCommunitySecret(token), expiresAt },
  })
  const sent = await sendCodeMail(email, code, token, title)
  return { emailSent: sent.ok, emailError: sent.ok ? null : (sent.disabled ? 'Email sending is turned off on this site.' : 'We couldn’t send the code just now.') }
}

export async function submitCommunity(body: Record<string, unknown>, req: Request, userId?: string | null) {
  const parsed = parseCommunity(body)
  if ('error' in parsed) return { ok: false as const, status: 400, error: parsed.error }
  const input = parsed.input
  const since = new Date(Date.now() - 86_400_000)
  const ipHash = communityIpHash(req)
  const [byEmail, byIp] = await Promise.all([
    prisma.event.count({ where: { contactEmail: input.contactEmail, communityKey: { not: null }, createdAt: { gte: since } } }),
    prisma.event.count({ where: { submitIpHash: ipHash, communityKey: { not: null }, createdAt: { gte: since } } }),
  ])
  if (overRateLimit(byEmail) || overRateLimit(byIp)) {
    return { ok: false as const, status: 429, error: 'That’s enough listings for today. Try again tomorrow.' }
  }
  const { venueName, venueAddress } = venueFor(input)
  const idSeed = randomBytes(8).toString('hex')
  const event = await prisma.event.create({
    data: {
      title: input.title,
      description: input.description,
      date: new Date(`${input.startDate}T00:00:00.000Z`),
      endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
      time: input.startTime,
      endTime: input.endTime,
      venueName,
      venueAddress,
      suburb: input.suburb,
      category: input.boardCategory,
      subTags: input.subTags,
      isFree: input.isFree,
      price: input.isFree ? 'Free' : input.priceNote,
      priceMin: input.isFree ? 0 : null,
      imageUrl: input.imageUrl,
      ticketUrl: input.websiteUrl,
      organiserUrl: input.websiteUrl,
      organiserName: input.organiserName,
      source: 'community',
      sources: ['community'],
      city: input.city,
      dedupeHash: `community-${idSeed}`,
      seriesKey: makeSeriesKey(input.title, venueName, input.city),
      promoterId: userId ?? null,
      status: 'SCHEDULED',
      recurrence: input.recurrence === 'NONE' ? null : input.recurrence,
      communityKey: input.communityKey,
      submissionState: 'PENDING_EMAIL',
      approvalState: 'PENDING',
      locationVisibility: input.locationVisibility,
      contactEmail: input.contactEmail,
      childrenInImage: input.childrenInImage,
      imageKidSafe: input.imageKidSafe,
      communityFlags: parsed.flags,
      submitIpHash: ipHash,
      templateKey: typeof body.preset === 'string' ? body.preset.slice(0, 40) : null,
    },
    select: { id: true, title: true },
  })
  await audit(event.id, 'SUBMIT', parsed.flags.join(',') || null, userId)
  await metric('SUBMIT', { city: input.city, suburb: input.suburb, category: input.communityKey })
  const mail = await issueCode(event.id, input.contactEmail, event.title)
  return { ok: true as const, status: 200, eventId: event.id, review: parsed.review, ...mail }
}

export async function resendCommunityCode(eventId: string) {
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, title: true, contactEmail: true, communityKey: true, submissionState: true } })
  if (!ev?.communityKey || !ev.contactEmail) return { ok: false as const, status: 404, error: 'Listing not found.' }
  if (ev.submissionState !== 'PENDING_EMAIL') return { ok: false as const, status: 400, error: 'This listing is already confirmed.' }
  const recent = await prisma.communityCode.count({ where: { eventId: ev.id, createdAt: { gte: new Date(Date.now() - 86_400_000) } } })
  if (recent >= 3) return { ok: false as const, status: 429, error: 'That’s enough codes for today. Check your inbox for the latest one.' }
  const mail = await issueCode(ev.id, ev.contactEmail, ev.title)
  return { ok: true as const, status: 200, eventId: ev.id, ...mail }
}

async function acceptVerification(eventId: string) {
  const ev = await prisma.event.findUnique({ where: { id: eventId } })
  if (!ev?.communityKey || !ev.contactEmail) return { ok: false as const, status: 404, error: 'Listing not found.' }
  if (ev.submissionState === 'SUBMITTED') {
    return { ok: true as const, status: 200, already: true, approvalState: ev.approvalState, path: eventPath(ev), posterPath: `/local/poster/${ev.id}` }
  }
  const review = (ev.communityFlags ?? []).some((f) => ['SCHOOL', 'SCHOOL_ADDRESS', 'SCHOOL_IMAGE', 'CHILDREN_IMAGE', 'SPAM', 'FAST'].includes(f))
  const approvalState = review ? 'PENDING' : 'APPROVED'
  const manageToken = randomBytes(32).toString('hex')
  const ticketUrl = ev.ticketUrl || ev.organiserUrl || eventPath(ev)
  await prisma.event.update({
    where: { id: ev.id },
    data: {
      submissionState: 'SUBMITTED',
      approvalState,
      emailVerifiedAt: new Date(),
      manageTokenHash: hashCommunitySecret(manageToken),
      ticketUrl,
      organiserEditedAt: new Date(),
    },
  })
  await audit(ev.id, 'VERIFY', approvalState)
  if (approvalState === 'APPROVED') {
    await audit(ev.id, 'APPROVE', 'email verified, no higher-risk flags')
    await metric('APPROVED', { city: ev.city, suburb: ev.suburb, category: ev.communityKey })
  }
  const managePath = `/local/manage/${manageToken}`
  const link = `${siteUrl()}${managePath}`
  const page = `${siteUrl()}${eventPath(ev)}`
  await sendEmail({
    to: ev.contactEmail,
    subject: approvalState === 'APPROVED' ? 'Your VibePeep listing is live' : 'VibePeep has your listing',
    html: `<div style="font-family:Georgia,serif;color:#1c1c1e;line-height:1.5">
      <p>${approvalState === 'APPROVED' ? 'It’s up. Neighbours can peep it now.' : 'Got it. A person will check this one before it goes public.'}</p>
      <p><a href="${esc(page)}">Listing page</a></p>
      <p><a href="${esc(link)}">Edit, postpone or take it down</a>. Keep this link. It’s the key to the listing.</p>
      <p><a href="${esc(siteUrl())}/local/poster/${ev.id}">Printable poster</a></p>
      <p style="font-size:12px;color:#666"><strong>Acknowledgement of Country.</strong> ${esc(ACKNOWLEDGEMENT_OF_COUNTRY)}</p>
    </div>`,
    text: `${approvalState === 'APPROVED' ? 'Your listing is live.' : 'A person will check this listing before it goes public.'}\n${page}\nManage: ${link}\nPoster: ${siteUrl()}/local/poster/${ev.id}`,
  }).catch(() => null)
  return {
    ok: true as const,
    status: 200,
    approvalState,
    path: eventPath(ev),
    managePath,
    posterPath: `/local/poster/${ev.id}`,
    review,
  }
}

export async function verifyCommunity(body: { eventId?: string; code?: string; token?: string }) {
  const token = (body.token ?? '').trim()
  const code = (body.code ?? '').replace(/\s+/g, '')
  const now = new Date()
  if (token) {
    const row = await prisma.communityCode.findUnique({ where: { tokenHash: hashCommunitySecret(token) } })
    if (!row || row.usedAt || row.expiresAt < now) return { ok: false as const, status: 400, error: 'That link has expired. Ask for a fresh code.' }
    await prisma.communityCode.update({ where: { id: row.id }, data: { usedAt: now } })
    return acceptVerification(row.eventId)
  }
  const eventId = (body.eventId ?? '').trim()
  if (!eventId || !/^\d{6}$/.test(code)) return { ok: false as const, status: 400, error: 'Enter the 6-digit code from your email.' }
  const row = await prisma.communityCode.findFirst({ where: { eventId, usedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' } })
  if (!row || row.attempts >= 5) return { ok: false as const, status: 400, error: 'That code has expired. Ask for a fresh one.' }
  if (row.codeHash !== hashCommunitySecret(code)) {
    await prisma.communityCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } })
    return { ok: false as const, status: 400, error: 'That code doesn’t match. Check the email and try again.' }
  }
  await prisma.communityCode.update({ where: { id: row.id }, data: { usedAt: now } })
  return acceptVerification(eventId)
}

const MANAGE_SELECT = {
  id: true, title: true, description: true, date: true, endDate: true, time: true, endTime: true, venueName: true, venueAddress: true,
  suburb: true, city: true, category: true, isFree: true, price: true, imageUrl: true, ticketUrl: true, organiserUrl: true, organiserName: true,
  status: true, recurrence: true, communityKey: true, submissionState: true, approvalState: true, locationVisibility: true, contactEmail: true,
  childrenInImage: true, imageKidSafe: true, deletedAt: true, communityFlags: true,
} as const

export async function loadManagedListing(token: string) {
  const hash = hashCommunitySecret(token)
  const ev = await prisma.event.findUnique({ where: { manageTokenHash: hash }, select: MANAGE_SELECT })
  if (!ev?.communityKey || ev.deletedAt) return null
  return ev
}

export async function updateManagedListing(token: string, body: Record<string, unknown>) {
  const current = await loadManagedListing(token)
  if (!current) return { ok: false as const, status: 404, error: 'That manage link doesn’t match a listing.' }
  const action = typeof body.action === 'string' ? body.action : ''
  if (action === 'postpone' || action === 'cancel' || action === 'schedule') {
    const status = action === 'postpone' ? 'POSTPONED' : action === 'cancel' ? 'CANCELLED' : 'SCHEDULED'
    await prisma.event.update({ where: { id: current.id }, data: { status, statusSource: 'community', organiserEditedAt: new Date() } })
    await audit(current.id, action.toUpperCase(), status)
    return { ok: true as const, status: 200 }
  }
  if (action === 'reschedule') {
    const date = typeof body.startDate === 'string' ? body.startDate : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false as const, status: 400, error: 'Pick the new date.' }
    await prisma.event.update({
      where: { id: current.id },
      data: { date: new Date(`${date}T00:00:00.000Z`), status: 'RESCHEDULED', statusSource: 'community', organiserEditedAt: new Date() },
    })
    await audit(current.id, 'RESCHEDULE', date)
    return { ok: true as const, status: 200 }
  }
  if (action === 'save-template') {
    await prisma.communityTemplate.create({
      data: {
        ownerEmail: current.contactEmail || 'unknown',
        title: current.title,
        communityKey: current.communityKey || 'garage-sales',
        description: current.description || current.title,
        suburb: current.suburb || '',
        city: current.city,
        startTime: current.time || '09:00',
        endTime: current.endTime,
        recurrence: current.recurrence || 'NONE',
        locationVisibility: current.locationVisibility || 'SUBURB',
        organiserName: current.organiserName,
        websiteUrl: current.organiserUrl,
        isFree: current.isFree,
      },
    })
    await audit(current.id, 'TEMPLATE', current.communityKey)
    return { ok: true as const, status: 200 }
  }
  const parsed = parseCommunity({
    ...body,
    contactEmail: current.contactEmail,
    isPublic: true,
    company: '',
    startedAt: Date.now() - 60_000,
  })
  if ('error' in parsed) return { ok: false as const, status: 400, error: parsed.error }
  const input = parsed.input
  const { venueName, venueAddress } = venueFor(input)
  const higher = parsed.flags.some((f) => f === 'CHILDREN_IMAGE' || f === 'SCHOOL_IMAGE' || f === 'SCHOOL_ADDRESS' || f === 'SPAM')
  await prisma.event.update({
    where: { id: current.id },
    data: {
      title: input.title,
      description: input.description,
      date: new Date(`${input.startDate}T00:00:00.000Z`),
      endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
      time: input.startTime,
      endTime: input.endTime,
      venueName,
      venueAddress,
      suburb: input.suburb,
      city: input.city,
      category: input.boardCategory,
      subTags: input.subTags,
      isFree: input.isFree,
      price: input.isFree ? 'Free' : input.priceNote,
      communityKey: input.communityKey,
      locationVisibility: input.locationVisibility,
      recurrence: input.recurrence === 'NONE' ? null : input.recurrence,
      organiserName: input.organiserName,
      organiserUrl: input.websiteUrl,
      ticketUrl: infoHref(input, current.id, input.title),
      imageUrl: input.imageUrl,
      childrenInImage: input.childrenInImage,
      imageKidSafe: input.imageKidSafe,
      communityFlags: parsed.flags,
      organiserEditedAt: new Date(),
      ...(higher && current.approvalState === 'APPROVED' ? { approvalState: 'PENDING' } : {}),
    },
  })
  await audit(current.id, 'EDIT', parsed.flags.join(',') || null)
  if (higher && current.approvalState === 'APPROVED') await audit(current.id, 'HOLD', 'edit raised a review flag')
  return { ok: true as const, status: 200, review: higher }
}

export async function claimCommunityEvent(eventId: string, user: { id: string; email: string }) {
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, communityKey: true, contactEmail: true, emailVerifiedAt: true, promoterId: true, deletedAt: true } })
  if (!ev?.communityKey || ev.deletedAt) return { ok: false as const, status: 404, error: 'Listing not found.' }
  if (!ev.emailVerifiedAt) return { ok: false as const, status: 403, error: 'Verify the listing email before claiming it.' }
  if ((ev.contactEmail ?? '').toLowerCase() !== user.email.toLowerCase()) return { ok: false as const, status: 403, error: 'Sign in with the email that confirmed this listing.' }
  await prisma.event.update({ where: { id: ev.id }, data: { promoterId: user.id, organiserEditedAt: new Date() } })
  await audit(ev.id, 'CLAIM', null, user.id)
  return { ok: true as const, status: 200 }
}

export async function templatesForEmail(email: string) {
  return prisma.communityTemplate.findMany({
    where: { ownerEmail: email.toLowerCase() },
    orderBy: { updatedAt: 'desc' },
    take: 12,
    select: { id: true, title: true, communityKey: true, description: true, suburb: true, city: true, startTime: true, endTime: true, recurrence: true, locationVisibility: true, organiserName: true, websiteUrl: true, isFree: true },
  })
}

export async function noteCommunityReport(eventId: string) {
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, communityKey: true, communityFlags: true, city: true, suburb: true } })
  if (!ev?.communityKey) return
  await audit(ev.id, 'REPORT', null)
  const open = await prisma.eventReport.count({ where: { eventId: ev.id, status: 'OPEN' } })
  if (open >= COMMUNITY_HOLD_REPORTS) {
    const flags = [...new Set([...(ev.communityFlags ?? []), 'REPORTED'])]
    await prisma.event.update({ where: { id: ev.id }, data: { approvalState: 'PENDING', communityFlags: flags } })
    await audit(ev.id, 'HOLD', `${open} open reports`)
  }
}

export async function moderateCommunity(eventId: string, action: 'approve' | 'reject' | 'remove', actorId: string, note?: string | null) {
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, communityKey: true, title: true, city: true, suburb: true, ticketUrl: true, organiserUrl: true } })
  if (!ev?.communityKey) return { ok: false as const, status: 404, error: 'Listing not found.' }
  const next = moderationResult(action)
  await prisma.event.update({
    where: { id: ev.id },
    data: {
      approvalState: next.approvalState,
      deletedAt: next.softDelete ? new Date() : null,
      submissionState: 'SUBMITTED',
      ...(action === 'approve' ? { ticketUrl: ev.ticketUrl || ev.organiserUrl || eventPath(ev) } : {}),
    },
  })
  await audit(ev.id, next.audit, note ?? null, actorId)
  if (action === 'approve') await metric('APPROVED', { city: ev.city, suburb: ev.suburb, category: ev.communityKey })
  return { ok: true as const, status: 200, approvalState: next.approvalState, kept: true }
}

const PUBLIC_SELECT = {
  id: true, title: true, description: true, date: true, endDate: true, time: true, endTime: true,
  venueName: true, venueAddress: true, suburb: true, city: true, category: true, isFree: true, price: true,
  imageUrl: true, ticketUrl: true, organiserUrl: true, organiserName: true, status: true, recurrence: true,
  communityKey: true, locationVisibility: true, childrenInImage: true, imageKidSafe: true, communityFlags: true,
} as const

function ymd(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

export const loadCommunityPage = cache((key: string) => communityOccurrences(JSON.parse(key) as Parameters<typeof communityOccurrences>[0]))

export async function communityOccurrences(opts: {
  section: string
  city?: string | null
  suburb?: string | null
  from?: string | null
  to?: string | null
  free?: boolean
  when?: string | null
}) {
  const section = sectionByKey(opts.section)
  if (!section) return null
  const city = opts.city ? CITIES.find((c) => c.name === opts.city || citySlug(c) === opts.city) ?? null : null
  if (opts.city && !city) return null
  const zone = city ?? cityDef('Sydney')
  const window = defaultWindow(zone)
  const from = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : window.from
  const to = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : window.to
  const when = opts.when && isWhenKey(opts.when) ? opts.when : null
  const rows = await prisma.event.findMany({
    where: {
      communityKey: section.key,
      approvalState: 'APPROVED',
      deletedAt: null,
      duplicateOfId: null,
      ...(city ? { city: city.name } : {}),
    },
    select: PUBLIC_SELECT,
    orderBy: { date: 'asc' },
    take: 400,
  })
  const shaped = rows.map((row) => ({
    id: row.id,
    communityKey: row.communityKey || section.key,
    city: row.city,
    suburb: row.suburb,
    date: ymd(row.date) || '',
    endDate: ymd(row.endDate),
    recurrence: row.recurrence,
    time: row.time,
    isFree: row.isFree,
    status: row.status,
    title: row.title,
    description: row.description,
    venueName: row.venueName,
    venueAddress: row.venueAddress,
    endTime: row.endTime,
    category: row.category,
    price: row.price,
    imageUrl: row.imageUrl,
    ticketUrl: row.ticketUrl,
    organiserUrl: row.organiserUrl,
    organiserName: row.organiserName,
    locationVisibility: row.locationVisibility,
    childrenInImage: row.childrenInImage,
    imageKidSafe: row.imageKidSafe,
    communityFlags: row.communityFlags,
  }))
  const matched = filterCommunityListings(shaped, { section: section.key, city: city?.name, suburb: opts.suburb, from, to, free: opts.free, when }, zone)
  const ids = new Set(matched.map((row) => row.id))
  return { section, city, from, to, when, rows: matched, listingCount: ids.size }
}

export async function recordCommunityEntrance(path: string, meta: { section?: string | null; city?: string | null; suburb?: string | null }, referer: string | null, host: string | null, userAgent: string | null) {
  if (/bot|crawl|spider|slurp|preview/i.test(userAgent ?? '')) return
  let organic = !referer
  if (referer) {
    try { organic = new URL(referer).host !== (host ?? '') } catch { organic = false }
  }
  if (!organic) return
  await metric('ORGANIC', { path, category: meta.section, city: meta.city, suburb: meta.suburb })
}

export async function communityAdminSnapshot() {
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [grouped, submitted, approved, organic, queue] = await Promise.all([
    prisma.event.groupBy({
      by: ['city', 'suburb', 'communityKey'],
      where: { communityKey: { not: null }, approvalState: 'APPROVED', deletedAt: null },
      _count: { _all: true },
    }),
    prisma.event.count({ where: { communityKey: { not: null }, submissionState: 'SUBMITTED' } }),
    prisma.event.count({ where: { communityKey: { not: null }, approvalState: 'APPROVED', deletedAt: null } }),
    prisma.communityMetric.count({ where: { kind: 'ORGANIC', createdAt: { gte: since } } }),
    prisma.event.findMany({
      where: {
        communityKey: { not: null },
        deletedAt: null,
        OR: [{ approvalState: 'PENDING' }, { reports: { some: { status: 'OPEN' } } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, title: true, suburb: true, city: true, communityKey: true, approvalState: true, submissionState: true,
        communityFlags: true, status: true, createdAt: true, contactEmail: true, venueAddress: true, childrenInImage: true,
        communityAudits: { orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, action: true, detail: true, createdAt: true } },
        _count: { select: { reports: true } },
      },
    }),
  ])
  return {
    perSuburb: grouped.map((row) => ({ city: row.city, suburb: row.suburb, category: row.communityKey, count: row._count._all })),
    submitted,
    approved,
    approvedRate: submitted ? approved / submitted : null,
    organic30d: organic,
    queue,
  }
}

export async function communitySitemapPaths(): Promise<string[]> {
  const rows = await prisma.event.findMany({
    where: { communityKey: { not: null }, approvalState: 'APPROVED', deletedAt: null, duplicateOfId: null },
    select: { id: true, communityKey: true, city: true, suburb: true, date: true, endDate: true, recurrence: true, time: true, isFree: true, status: true },
    take: 2000,
  })
  const paths = new Set<string>()
  for (const section of COMMUNITY_SECTIONS) {
    const mine = rows.filter((row) => row.communityKey === section.key)
    const asOcc: CommunityOccurrence[] = mine.map((row) => ({
      id: row.id, communityKey: row.communityKey || section.key, city: row.city, suburb: row.suburb,
      date: row.date.toISOString().slice(0, 10), endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
      recurrence: row.recurrence, time: row.time, isFree: row.isFree, status: row.status,
    }))
    if (communityPageIndexable(new Set(asOcc.map((r) => r.id)).size, 'section')) paths.add(communitySectionPath(section.key))
    for (const city of CITIES) {
      const window = defaultWindow(city)
      const cityRows = filterCommunityListings(asOcc, { section: section.key, city: city.name, from: window.from, to: window.to }, city)
      const cityCount = new Set(cityRows.map((r) => r.id)).size
      if (communityPageIndexable(cityCount, 'city')) paths.add(communityCityPath(section.key, city.name))
      const suburbs = [...new Set(cityRows.map((r) => r.suburb).filter((s): s is string => !!s))]
      for (const suburb of suburbs) {
        const n = new Set(cityRows.filter((r) => suburbMatches(r.suburb, suburb)).map((r) => r.id)).size
        if (communityPageIndexable(n, 'suburb')) paths.add(communityPlacePath(section.key, city.name, suburb))
      }
    }
  }
  return [...paths]
}

export function pageKindFor(opts: { city?: string | null; suburb?: string | null; when?: string | null; date?: string | null }): CommunityPageKind {
  if (opts.when || opts.date) return 'date'
  if (opts.suburb) return 'suburb'
  if (opts.city) return 'city'
  return 'section'
}

export { cityToday, addDaysKey }
