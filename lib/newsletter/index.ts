import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { pickEvents, MAX_SPONSORED, type NlEvent } from './rank'
import { issueCopy, SUBJECT_STYLES, type SubjectLine, type SubjectStyle } from './copy'
import { emailImage, imageLoads, type EmailKind } from './images'
import { renderHtml, renderText, type CtaVariant, type Slot } from './render'
import { runQa, type QaReport } from './qa'

export type Mode = 'send' | 'test' | 'preview'

export interface BuiltNewsletter {
  sendId: string
  html: string
  text: string
  subject: string
  preview: string
  subjects: SubjectLine[]
  chosen: SubjectStyle
  cta: CtaVariant
  sponsoredPos: 'mid' | 'end'
  headline: string
  copySource: string
  qa: QaReport
  eventIds: string[]
  city: string
  edition: string
  sections: { placement: string; eventId: string; title: string; category: string; why: string[]; score: number; image: string | null; blurb: string }[]
}

/** Epsilon-greedy pick of the subject style with the best unique-click rate over the last 90 days. */
async function chooseStyle(): Promise<SubjectStyle> {
  const since = new Date(Date.now() - 90 * 86400e3)
  const sends = await prisma.newsletterSend.findMany({ where: { status: 'SENT', sentAt: { gte: since } }, select: { variant: true, _count: { select: { clicks: { where: { target: { not: 'unsubscribe' } } } } } }, take: 5000 })
  const st = Object.fromEntries(SUBJECT_STYLES.map((s) => [s, { n: 0, c: 0 }])) as Record<SubjectStyle, { n: number; c: number }>
  for (const s of sends) if (s.variant in st) { st[s.variant as SubjectStyle].n++; if (s._count.clicks) st[s.variant as SubjectStyle].c++ }
  const under = SUBJECT_STYLES.filter((s) => st[s].n < 30)
  if (under.length) return under[Math.floor(Math.random() * under.length)]
  if (Math.random() < 0.2) return SUBJECT_STYLES[Math.floor(Math.random() * SUBJECT_STYLES.length)]
  return [...SUBJECT_STYLES].sort((a, b) => st[b].c / st[b].n - st[a].c / st[a].n)[0]
}

async function slot(ev: NlEvent, kind: EmailKind, blurb: string, warnings: string[]): Promise<Slot> {
  let img = await emailImage(ev, kind)
  if (img && !(await imageLoads(img))) { warnings.push(`Image failed to load, fallback used: ${ev.title}`); img = null }
  return { ev, img, blurb }
}

export async function buildNewsletter(userId: string, opts: { mode: Mode; city?: string; edition?: string }): Promise<{ skip: string } | BuiltNewsletter> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { skip: 'User not found' }
  const edition = opts.edition || user.emailFrequency || 'weekly'
  const picked = await pickEvents(userId, { city: opts.city, edition })
  if (!picked?.hero) return { skip: `No upcoming events that meet the quality bar in ${picked?.city ?? 'this city'}` }

  const all = [picked.hero, ...picked.picks, ...(picked.wildcard ? [picked.wildcard] : []), ...picked.sponsored]
  const recent = await prisma.newsletterSend.findMany({ where: { userId, status: { in: ['SENT', 'TEST'] } }, orderBy: { sentAt: 'desc' }, take: 12, select: { headline: true, subject: true } })
  const [style, copy] = await Promise.all([
    chooseStyle(),
    issueCopy(all, {
      city: picked.city, edition, hero: picked.hero, sponsoredIds: picked.sponsored.map((e) => e.id),
      recentHeadlines: recent.slice(0, 6).map((r) => r.headline).filter(Boolean), recentSubjects: recent.map((r) => r.subject).filter(Boolean),
    }),
  ])
  const chosen = copy.subjects.find((s) => s.style === style) ?? copy.subjects[0]
  const cta: CtaVariant = Math.random() < 0.5 ? 'A' : 'B'
  const sponsoredPos = Math.random() < 0.5 ? 'mid' : 'end'

  const sendId = opts.mode === 'preview'
    ? 'preview'
    : (await prisma.newsletterSend.create({ data: { userId, city: picked.city, edition, subject: chosen.subject, preview: chosen.preview, variant: chosen.style, cta, headline: copy.headline, status: 'PENDING' } })).id

  const imgWarnings: string[] = []
  const [hero, picks, wildcard, sponsored] = await Promise.all([
    slot(picked.hero, 'hero', copy.blurbs[picked.hero.id], imgWarnings),
    Promise.all(picked.picks.map((e) => slot(e, 'thumb', copy.blurbs[e.id], imgWarnings))),
    picked.wildcard ? slot(picked.wildcard, 'hero', copy.blurbs[picked.wildcard.id], imgWarnings) : null,
    Promise.all(picked.sponsored.map((e) => slot(e, 'thumb', copy.blurbs[e.id], imgWarnings))),
  ])
  const issueDate = picked.from.toISOString().slice(0, 10)
  const input = {
    ctx: { sendId, edition, issueDate, city: picked.city }, userId, email: user.email, editionKey: edition, city: picked.city,
    from: picked.from, to: picked.to, headline: copy.headline, intro: copy.intro, preview: chosen.preview, subject: chosen.subject,
    cta, hero, picks, wildcard, sponsored, sponsoredPos, trackOpens: opts.mode === 'send',
  } as const
  const html = renderHtml(input)
  const text = renderText(input)
  const placed = [
    { placement: 'hero', s: hero }, ...picks.map((s) => ({ placement: 'picks', s })),
    ...(wildcard ? [{ placement: 'wildcard', s: wildcard }] : []), ...sponsored.map((s) => ({ placement: 'sponsored', s })),
  ]
  const qa = runQa({
    html, text, subject: chosen.subject, preview: chosen.preview, sponsored: sponsored.length > 0, from: picked.from, to: picked.to,
    optedIn: user.emailOptIn, realSend: opts.mode === 'send', sections: placed.map((p) => ({ placement: p.placement, ev: p.s.ev, img: p.s.img })),
  })
  qa.warnings.unshift(...imgWarnings)
  if (sponsored.length) qa.checks.push(`Paid placements included: ${sponsored.map((s) => `${s.ev.title} (${(s.ev as any).tier === 'SPOTLIGHT' ? 'Newsletter boost' : 'Headliner'})`).join(', ')}`)
  if (picked.missedBoosts) qa.warnings.push(`${picked.missedBoosts} active Newsletter boost(s) in ${picked.city} didn't fit this issue (max ${MAX_SPONSORED}); they rotate in first next issue`)
  if (picks.length < 3) qa.warnings.push(`Shorter edition: only ${picks.length} pick(s) met the quality bar`)
  if (copy.source !== 'ai') qa.warnings.push(`Editorial copy used ${copy.source === 'fallback' ? 'fallback lines only' : 'some fallback lines'}`)

  return {
    sendId, html, text, subject: chosen.subject, preview: chosen.preview, subjects: copy.subjects, chosen: chosen.style, cta, sponsoredPos,
    headline: copy.headline, copySource: copy.source, qa, eventIds: all.map((e) => e.id), city: picked.city, edition,
    sections: placed.map((p) => ({ placement: p.placement, eventId: p.s.ev.id, title: p.s.ev.title, category: p.s.ev.category, why: p.s.ev.why, score: Math.round(p.s.ev.score), image: p.s.img, blurb: p.s.blurb })),
  }
}

/** Builds, QA-checks and sends one issue. `test` sends to `to` (or the subscriber) without affecting schedules or repeat-avoidance. */
export async function sendNewsletter(userId: string, opts: { mode: 'send' | 'test'; to?: string; city?: string; edition?: string }) {
  const built = await buildNewsletter(userId, { mode: opts.mode, city: opts.city, edition: opts.edition })
  if ('skip' in built) {
    if (opts.mode === 'send') {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { homeCity: true, preferredCities: true, emailFrequency: true } })
      await prisma.newsletterSend.create({ data: { userId, city: u?.preferredCities[0] || u?.homeCity || '', edition: u?.emailFrequency ?? 'weekly', subject: '', preview: '', status: 'SKIPPED', error: built.skip } })
      await prisma.user.update({ where: { id: userId }, data: { lastDigestAt: new Date() } })
    }
    return { ok: false, skipped: true, error: built.skip }
  }
  const base = { eventIds: built.eventIds, sections: { sponsoredPos: built.sponsoredPos, items: built.sections } as any, subjects: built.subjects as any, qa: built.qa as any }
  if (!built.qa.pass) {
    await prisma.newsletterSend.update({ where: { id: built.sendId }, data: { ...base, status: 'BLOCKED', error: built.qa.errors.join('; ').slice(0, 1000) } })
    return { ok: false, blocked: true, error: `QA blocked send: ${built.qa.errors[0]}`, qa: built.qa }
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  const to = opts.to || user!.email
  const res = await sendEmail({ to, subject: built.subject, html: built.html, text: built.text })
  if (res.disabled) {
    await prisma.newsletterSend.update({
      where: { id: built.sendId },
      data: { ...base, status: 'SKIPPED', error: res.error ?? 'Email sending is turned off' },
    })
    return { ...res, subject: built.subject, qa: built.qa, sendId: built.sendId }
  }
  await prisma.newsletterSend.update({
    where: { id: built.sendId },
    data: { ...base, status: res.ok ? (opts.mode === 'test' ? 'TEST' : 'SENT') : 'FAILED', error: res.ok ? null : res.error ?? 'send failed', sentAt: new Date() },
  })
  if (res.ok && opts.mode === 'send') await prisma.user.update({ where: { id: userId }, data: { lastDigestAt: new Date() } })
  return { ...res, subject: built.subject, qa: built.qa, sendId: built.sendId }
}
