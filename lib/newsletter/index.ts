import { prisma } from '@/lib/prisma'
import { redactEmails, sendEmail } from '@/lib/email'
import { recordMailDelivery } from '@/lib/mail-log'
import { pickEvents, MAX_SPONSORED, type NlEvent } from './rank'
import { issueCopy, SUBJECT_STYLES, type SubjectLine, type SubjectStyle } from './copy'
import { emailImageSrc, type EmailKind } from './images'
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
  sections: { placement: string; eventId: string; title: string; category: string; why: string[]; whyLine: string; score: number; image: string | null; blurb: string }[]
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

function slot(ev: NlEvent, kind: EmailKind, blurb: string): Slot {
  return { ev, img: emailImageSrc(ev, kind), blurb }
}

const clipPreview = (s: string, n = 90) => {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  return `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…`
}

export async function buildNewsletter(userId: string, opts: { mode: Mode; city?: string; edition?: string }): Promise<{ skip: string } | BuiltNewsletter> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { skip: 'User not found' }
  const edition = opts.edition || user.emailFrequency || 'weekly'
  const picked = await pickEvents(userId, { city: opts.city, edition })
  if (!picked?.hero) return { skip: `No upcoming events that meet the quality bar in ${picked?.city ?? 'this city'}` }

  const all = [picked.hero, ...picked.weekend, ...picked.because, ...picked.saved, ...picked.free, ...picked.popular, ...picked.sponsored].filter((e): e is NlEvent => !!e)
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

  const preview = clipPreview(`${picked.greeting.replace(/,$/, '')} — ${picked.intro}`)
  const sendId = opts.mode === 'preview'
    ? 'preview'
    : (await prisma.newsletterSend.create({ data: { userId, city: picked.city, edition, subject: chosen.subject, preview, variant: chosen.style, cta, headline: picked.greeting, status: 'PENDING' } })).id

  const hero = slot(picked.hero, 'hero', copy.blurbs[picked.hero.id] ?? '')
  const pack = (rows: NlEvent[], kind: EmailKind = 'thumb') => rows.map((e) => slot(e, kind, copy.blurbs[e.id] ?? ''))
  const weekend = pack(picked.weekend)
  const because = pack(picked.because)
  const saved = pack(picked.saved)
  const free = pack(picked.free)
  const popular = pack(picked.popular)
  const sponsored = pack(picked.sponsored)
  const issueDate = picked.from.toISOString().slice(0, 10)
  const input = {
    ctx: { sendId, edition, issueDate, city: picked.city }, userId, email: user.email, editionKey: edition, city: picked.city,
    from: picked.from, to: picked.to, greeting: picked.greeting, intro: picked.intro, preview, subject: chosen.subject,
    cta, nearTitle: picked.nearTitle, becauseTitle: picked.becauseTitle, reminderOptIn: picked.reminderOptIn,
    hero, weekend, because, saved, free, popular, sponsored, sponsoredPos, trackOpens: opts.mode === 'send',
  } as const
  const html = renderHtml(input)
  const text = renderText(input)
  const placed = [
    { placement: 'hero', s: hero },
    ...weekend.map((s) => ({ placement: 'weekend', s })),
    ...because.map((s) => ({ placement: 'because', s })),
    ...saved.map((s) => ({ placement: 'saved', s })),
    ...free.map((s) => ({ placement: 'free', s })),
    ...popular.map((s) => ({ placement: 'popular', s })),
    ...sponsored.map((s) => ({ placement: 'sponsored', s })),
  ]
  const qa = runQa({
    html, text, subject: chosen.subject, preview, sponsored: sponsored.length > 0, from: picked.from, to: picked.to,
    optedIn: user.emailOptIn, realSend: opts.mode === 'send', sections: placed.map((p) => ({ placement: p.placement, ev: p.s.ev, img: p.s.img })),
  })
  const missingArt = placed.filter((p) => !p.s.img)
  for (const p of missingArt) qa.warnings.push(`No usable image, category placeholder used: ${p.s.ev.title} (${p.placement})`)
  if (sponsored.length) qa.checks.push(`Paid placements included: ${sponsored.map((s) => `${s.ev.title} (${(s.ev as { tier?: string }).tier === 'SPOTLIGHT' ? 'Newsletter boost' : 'Headliner'})`).join(', ')}`)
  if (picked.missedBoosts) qa.warnings.push(`${picked.missedBoosts} active Newsletter boost(s) in ${picked.city} didn't fit this issue (max ${MAX_SPONSORED}); they rotate in first next issue`)
  const editorial = weekend.length + because.length + free.length + popular.length
  if (editorial < 3) qa.warnings.push(`Shorter edition: only ${editorial} pick(s) met the quality bar`)
  if (copy.source !== 'ai') qa.warnings.push(`Editorial copy used ${copy.source === 'fallback' ? 'fallback lines only' : 'some fallback lines'}`)

  return {
    sendId, html, text, subject: chosen.subject, preview, subjects: copy.subjects, chosen: chosen.style, cta, sponsoredPos,
    headline: picked.greeting, copySource: copy.source, qa, eventIds: all.map((e) => e.id), city: picked.city, edition,
    sections: placed.map((p) => ({ placement: p.placement, eventId: p.s.ev.id, title: p.s.ev.title, category: p.s.ev.category, why: p.s.ev.why, whyLine: p.s.ev.whyLine, score: Math.round(p.s.ev.score), image: p.s.img, blurb: p.s.blurb })),
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
    const error = built.qa.errors.join('; ').slice(0, 1000)
    await prisma.newsletterSend.update({ where: { id: built.sendId }, data: { ...base, status: 'BLOCKED', error } })
    console.error(`[digest] newsletter user=${userId} blocked: ${error}`)
    await recordMailDelivery({ kind: 'newsletter', userId, status: 'blocked', error })
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
    await recordMailDelivery({ kind: 'newsletter', userId, status: 'disabled', error: res.error })
    return { ...res, subject: built.subject, qa: built.qa, sendId: built.sendId }
  }
  const safeError = res.ok ? null : redactEmails(res.error ?? 'send failed')
  const status = res.ok ? (opts.mode === 'test' ? 'TEST' : 'SENT') : 'FAILED'
  await prisma.newsletterSend.update({
    where: { id: built.sendId },
    data: { ...base, status, error: safeError, sentAt: new Date() },
  })
  if (!res.ok) {
    console.error(`[digest] newsletter user=${userId} ${res.restricted ? 'restricted' : 'failed'}: ${safeError}`)
    await recordMailDelivery({ kind: 'newsletter', userId, status: res.restricted ? 'restricted' : 'failed', error: safeError })
  } else {
    await recordMailDelivery({ kind: 'newsletter', userId, status: opts.mode === 'test' ? 'test' : 'sent' })
  }
  if (res.ok && opts.mode === 'send') await prisma.user.update({ where: { id: userId }, data: { lastDigestAt: new Date() } })
  return { ...res, error: safeError ?? undefined, subject: built.subject, qa: built.qa, sendId: built.sendId }
}
