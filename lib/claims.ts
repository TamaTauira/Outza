import { prisma } from '@/lib/db'
import { approveClaim, emailMatchesOrganiser, notifyTrustTeam } from '@/lib/trust'
import { eventPath } from '@/lib/seo'
import { assessEventClaim, claimRateLimited, registrableDomain } from '@/lib/ownership'
import { verifiedOrganiserDomain } from '@/lib/event-overrides'

type Me = { id: string; role: string; email: string; name: string }
const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max) || null

/**
 * Organiser claim + verification. Auto-approves only when the claimant's work email shares a domain with the
 * event's own website; everything else waits for manual review in /admin/trust. Admins are approved directly.
 */
export async function submitClaim(me: Me, eventId: string, b: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, title: true, city: true, promoterId: true, organiserUrl: true, ticketUrl: true, sourceUrl: true, venueName: true, organiserName: true } })
  if (!ev) return { status: 404, body: { error: 'Event not found' } }
  if (ev.promoterId === me.id) return { status: 200, body: { ok: true, status: 'APPROVED', created: false } }
  if (ev.promoterId && me.role !== 'ADMIN') return { status: 409, body: { error: 'This listing is already managed by an organiser. If that’s wrong, use Report a problem on the event page.' } }
  const recentClaims = await prisma.eventClaim.count({ where: { userId: me.id, createdAt: { gt: new Date(Date.now() - 24 * 3600_000) } } })
  if (claimRateLimited(recentClaims)) return { status: 429, body: { error: 'That’s a lot of claims for one day. Try again tomorrow.' } }

  const orgName = clean(b.orgName, 120) ?? clean(me.name, 120)
  if (!orgName) return { status: 400, body: { error: 'Please enter your organisation name' } }
  let evidenceUrl = clean(b.evidenceUrl, 500)
  if (evidenceUrl && !/^https?:\/\//i.test(evidenceUrl)) evidenceUrl = `https://${evidenceUrl}`
  if (evidenceUrl) { try { new URL(evidenceUrl) } catch { return { status: 400, body: { error: 'That link doesn’t look right' } } } }

  const existing = await prisma.eventClaim.findUnique({ where: { eventId_userId: { eventId: ev.id, userId: me.id } } })
  if (existing?.status === 'PENDING') return { status: 200, body: { ok: true, status: 'PENDING', created: false } }

  const emailDomainMatches = emailMatchesOrganiser(me.email, [ev.organiserUrl, ev.ticketUrl, ev.sourceUrl])
  const orgDomain = await verifiedOrganiserDomain(me.id).catch(() => null)
  const orgHost = orgDomain ? registrableDomain(orgDomain) : ''
  const eventHosts = [ev.organiserUrl, ev.ticketUrl, ev.sourceUrl].filter(Boolean).map((url) => {
    try { return registrableDomain(new URL(url as string).hostname) } catch { return '' }
  })
  const existingVerifiedOrgLinked = !!orgHost && eventHosts.includes(orgHost)
  const decision = assessEventClaim({
    emailDomainMatches,
    existingVerifiedOrgLinked,
    claimedByOther: !!ev.promoterId && ev.promoterId !== me.id,
    aiScore: typeof b.aiScore === 'number' ? b.aiScore : null,
  })
  const auto = me.role === 'ADMIN' || decision.outcome === 'APPROVE'
  const data = {
    orgName,
    position: clean(b.position, 120),
    evidenceUrl,
    message: clean(b.message, 2000),
    method: decision.method === 'EXISTING_ORG' ? 'EXISTING_ORG' : decision.method === 'TRUSTED_SOURCE' ? 'TRUSTED_SOURCE' : auto ? 'EMAIL_DOMAIN' : 'MANUAL',
    status: 'PENDING',
    reviewNote: null,
    reviewedAt: null,
  }
  const claim = existing
    ? await prisma.eventClaim.update({ where: { id: existing.id }, data })
    : await prisma.eventClaim.create({ data: { ...data, eventId: ev.id, userId: me.id } })

  if (auto) {
    await approveClaim(claim.id, me.role === 'ADMIN' ? 'Added by an admin' : 'Accepted automatically: work email matches the event website')
  }
  await notifyTrustTeam(`${auto ? 'Claim accepted' : 'Listing claim to review'}: ${ev.title.slice(0, 60)}`, [
    ['Event', `${ev.title} (${ev.city})`], ['Link', eventPath(ev)], ['Claimant', `${me.name || ''} <${me.email}>`], ['Organisation', orgName],
    ['Position', data.position], ['Evidence', evidenceUrl], ['Message', data.message], ['Check', auto ? 'Automatic (email domain matches event website)' : 'Manual review needed'],
  ])
  return { status: 200, body: { ok: true, status: auto ? 'APPROVED' : 'PENDING', created: !existing } }
}
