import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { completeJson, gatewayModel, llmConfigured } from '@/lib/llm'
import { priceSummary } from '@/lib/quality'
import type { NlEvent } from './rank'
export const SUBJECT_STYLES = ['playful', 'curious', 'event-led'] as const
export type SubjectStyle = (typeof SUBJECT_STYLES)[number]
export interface SubjectLine { style: SubjectStyle; subject: string; preview: string }
export interface IssueCopy { headline: string; intro: string; subjects: SubjectLine[]; blurbs: Record<string, string>; source: 'ai' | 'fallback' | 'mixed' }

/** Claims we can never verify, so AI copy containing them is discarded. */
const BANNED = /\b(sold[- ]?out|selling fast|limited (tickets|spots)|last chance|trending|popular|crowd favourite|hottest|discount|% off|half price|book now before|award[- ]winning|best in|world[- ]famous|guaranteed)\b|\$|\d+%/i

function facts(e: NlEvent) {
  const p = priceSummary(e)
  return {
    id: e.id,
    title: e.title,
    category: e.category,
    tags: e.subTags.slice(0, 4),
    when: `${e.date.toISOString().slice(0, 10)}${e.time ? ` ${e.time}` : ''}`,
    venue: e.venueName,
    suburb: e.suburb,
    price: p.range,
    recurring: e.recurrence,
    description: (e.description ?? '').replace(/\s+/g, ' ').slice(0, 700),
  }
}
const hashFacts = (f: ReturnType<typeof facts>) => crypto.createHash('sha1').update(JSON.stringify(f)).digest('hex').slice(0, 16)

/** Deterministic, fact-only fallback: first sentence of the organiser's description, else a plain line. */
export function fallbackBlurb(e: NlEvent) {
  const first = (e.description ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? ''
  if (first.length >= 30 && first.length <= 170 && !BANNED.test(first)) return first
  return `${e.category} at ${e.venueName}${e.suburb ? `, ${e.suburb}` : ''}.`
}

/** Words that make a subject line feel like admin mail rather than an invitation. */
const DULL = /\b(newsletter|digest|weekly update|roundup|round-up|edition|issue|events this week|this week's events|update)\b|!!|\?\?|^(what'?s|what is) (on|brewing|happening|new)\b|^(here'?s|check out|don'?t miss)\b|\byou have plans$|\blook like\?$/i
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const words = (s: string) => new Set(norm(s).split(' ').filter((w) => w.length > 2))
/** True when a subject is too close to one the subscriber has already received (same text or most of the same words). */
export function tooSimilar(a: string, recent: string[]) {
  const wa = words(a)
  return recent.some((r) => {
    if (!r) return false
    if (norm(r) === norm(a)) return true
    const wr = words(r)
    const shared = [...wa].filter((w) => wr.has(w)).length
    return shared / Math.max(1, Math.min(wa.size, wr.size)) >= 0.6
  })
}

/** A subject must be short, specific to VibePeep's voice, free of unverifiable claims, and fresh for this subscriber. */
export function goodSubject(s: string, recent: string[], avoidTitles: string[] = [], titles: string[] = []) {
  const t = s.trim()
  // ALL CAPS shouting is out, unless the caps are part of a real event name in this issue.
  const shouty = (t.match(/\b[A-Z]{5,}\b/g) ?? []).some((w) => !titles.some((x) => x.includes(w)))
  return t.length >= 16 && t.length <= 60 && !BANNED.test(t) && !DULL.test(t) && !shouty
    && !tooSimilar(t, recent) && !avoidTitles.some((x) => x.length > 6 && norm(t).includes(norm(x).slice(0, 24)))
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`)
/** Event name trimmed for a subject line: drops a trailing year and city tag ("... 2026 SYDNEY"), nothing else changes. */
const subjectTitle = (title: string, city: string) =>
  title.replace(new RegExp(`(\\s*[-–|:,]?\\s*(${city}|20\\d\\d))+\\s*$`, 'i'), '').trim() || title

/** Hand-written, fact-free openers rotated when AI copy is missing or fails the checks. {city} and {title} are filled in. */
const FALLBACK_POOL: Record<SubjectStyle, { subject: string; preview: string }[]> = {
  playful: [
    { subject: `Your couch can wait. {city} can't.`, preview: `Gigs, markets and gems worth leaving the house for.` },
    { subject: `Pants on. {city}'s putting on a show.`, preview: `Your shortlist of good times is ready and waiting.` },
    { subject: `Warning: may cause spontaneous plans`, preview: `A few picks for you, plus a wildcard. Proceed with enthusiasm.` },
    { subject: `Your weekend called. It wants a glow-up.`, preview: `We've lined up the plans. You bring the energy.` },
    { subject: `Plot twist: you're going out this week`, preview: `Handpicked gigs, markets and surprises around {city}.` },
    { subject: `Leave the group chat on read. Go out.`, preview: `Then tell them all about it. Your picks are inside.` },
    { subject: `The streaming queue will forgive you`, preview: `{city} has better plot lines this week.` },
    { subject: `Diary looking thin? Not for long.`, preview: `We found things worth putting shoes on for.` },
  ],
  curious: [
    { subject: `{city}'s calling. Are you picking up?`, preview: `A handful of plans we reckon you'll like.` },
    { subject: `Psst. We've got the inside word on {city}`, preview: `Your picks, one curveball, and plenty more to explore.` },
    { subject: `What would future you be glad you did?`, preview: `Here's a head start. Open up.` },
    { subject: `We found your next good story`, preview: `It starts somewhere in {city}. Take a look.` },
    { subject: `Guess who's got plans? (Hint: you)`, preview: `Your shortlist is in. The wildcard is a goodie.` },
    { subject: `One of these is your new favourite thing`, preview: `We won't say which. Have a look around {city}.` },
  ],
  'event-led': [
    { subject: `{title}, and that's just the warm-up`, preview: `Plus picks for you and a wildcard around {city}.` },
    { subject: `First up: {title}`, preview: `Then a few more we reckon you'll like.` },
    { subject: `{title}? Yes. And there's more.`, preview: `Your picks around {city} are ready.` },
    { subject: `Starring this week: {title}`, preview: `Supporting cast: your picks and a wildcard.` },
    { subject: `{title} leads the charge`, preview: `The rest of your {city} shortlist is right behind it.` },
  ],
}

function fallbackSubject(style: SubjectStyle, city: string, top: NlEvent | null, recent: string[]): SubjectLine {
  const fill = (s: string, n = 60) => {
    const room = Math.max(12, n - s.replace('{title}', '').replace('{city}', city).length)
    return s.replace('{city}', city).replace('{title}', top ? clip(subjectTitle(top.title, city), room) : city)
  }
  const pool = FALLBACK_POOL[style].filter((t) => top || !t.subject.includes('{title}'))
  const shuffled = [...(pool.length ? pool : FALLBACK_POOL.playful)].sort(() => Math.random() - 0.5)
  const pick = shuffled.find((t) => !tooSimilar(fill(t.subject), recent)) ?? shuffled[0]
  return { style, subject: fill(pick.subject), preview: fill(pick.preview, 110) }
}

async function llm(messages: { role: 'system' | 'user'; content: string }[]) {
  if (!llmConfigured()) throw new Error('LLM not configured')
  return completeJson({
    messages,
    temperature: 0.7,
    maxOutputTokens: 1800,
    timeoutMs: 45_000,
    maxRetries: 2,
  })
}

const SYSTEM = `You are the editor of VibePeep, an Australian events newsletter. Voice: energetic, witty, confident, modern, adventurous, distinctly Australian - but no heavy slang, no forced jokes, no clichés repeated between items.
HARD RULES:
- Use ONLY the facts supplied. Never invent performers, line-ups, activities, food, prices, discounts, awards, popularity, demand or availability.
- Never write "sold out", "selling fast", "trending", "popular", "limited", "last chance", dollar amounts or percentages.
- If the description is thin, write about the category/venue/vibe in general terms rather than inventing specifics.
- Blurbs: one or two short sentences, max 150 characters, no emojis, vary sentence structure across items.
- Subject lines are the most important words we write: each must make a subscriber NEED to open the email. Fresh, energetic, witty, exciting: playful wordplay, a cheeky hook or a vivid picture of the night out. Max 55 characters, at most one emoji across all of them, no ALL CAPS words, no fake urgency or clickbait, never boring admin words (newsletter, digest, update, roundup, edition). Never reuse or closely echo a subject the subscriber has already received. Never name an event marked sponsored in a subject, preview or headline.
- Preview text: max 90 characters, adds a second hook that complements (not repeats) the subject.
- Every subject needs a real hook: wordplay, a vivid picture of the night, cheeky personification or a surprising contrast. Generic questions are banned.
- Great subject examples (do not reuse): "Your couch called. We let it go to voicemail."; "Big riffs, small bar, zero regrets"; "Saturday has entered the chat"; "Glitter, gelato and one very good wildcard".
- Flat subjects we reject (never write anything like these): "What's on in Sydney this week?"; "What's brewing in Sydney?"; "Sydney, you have plans"; "Don't miss these events"; "What do your plans look like?".
- In event-led subjects, shorten long event names naturally (drop years, city tags and series numbers) and don't shout in capitals.
Reply with raw JSON only.`

/**
 * Generates the issue's editorial copy. Blurbs are cached per event (re-generated only when the facts change);
 * headline/intro/subjects are generated per issue and avoid the subscriber's recent headlines and subject lines.
 * Two subject options per style are requested; the first that passes goodSubject() wins, else a fresh fallback.
 */
export async function issueCopy(events: NlEvent[], ctx: { city: string; edition: string; recentHeadlines: string[]; recentSubjects: string[]; hero: NlEvent | null; sponsoredIds: string[] }): Promise<IssueCopy> {
  const fs = events.map(facts)
  const sponsoredTitles = events.filter((e) => ctx.sponsoredIds.includes(e.id)).map((e) => e.title)
  const cached = await prisma.eventBlurb.findMany({ where: { eventId: { in: events.map((e) => e.id) } } })
  const blurbs: Record<string, string> = {}
  const need: ReturnType<typeof facts>[] = []
  for (const f of fs) {
    const c = cached.find((x) => x.eventId === f.id)
    if (c && c.factsHash === hashFacts(f)) blurbs[f.id] = c.text
    else need.push(f)
  }
  let source: IssueCopy['source'] = 'ai'
  let headline = '', intro = ''
  let subjects: SubjectLine[] = []
  try {
    const out = await llm([
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `City: ${ctx.city}. Edition: ${ctx.edition}. Events in this issue (hero first):\n${JSON.stringify(fs.map(({ id, title, category, when, venue, suburb, price }) => ({ id, title, category, when, venue, suburb, price, ...(ctx.sponsoredIds.includes(id) ? { sponsored: true } : {}) })))}
Write blurbs for these events only:\n${JSON.stringify(need)}
Avoid these recent headlines: ${JSON.stringify(ctx.recentHeadlines)}
Subjects this subscriber already received (never repeat or echo): ${JSON.stringify(ctx.recentSubjects)}
Examples of tone (do not reuse): headline "Your couch called. We declined."; farmers market "Good coffee, fresh finds and the kind of Saturday morning you'll actually wake up for."; rock gig "Big riffs. Legendary anthems. Your ears have plans."
JSON shape: {"headline":"max 45 chars","intro":"one or two sentences, max 170 chars, mentions ${ctx.city}","blurbs":{"<event id>":"text"},"subjects":[two objects per style: {"style":"playful","subject":"","preview":""}, {"style":"curious",...}, {"style":"event-led","subject":"names a real non-sponsored event from the list",...}]}`,
      },
    ])
    headline = typeof out.headline === 'string' && out.headline.length <= 60 && !BANNED.test(out.headline) && !sponsoredTitles.some((t) => out.headline.includes(t)) ? out.headline.trim() : ''
    intro = typeof out.intro === 'string' && out.intro.length <= 220 && !BANNED.test(out.intro) ? out.intro.trim() : ''
    for (const f of need) {
      const t = out.blurbs?.[f.id]
      if (typeof t === 'string' && t.length >= 20 && t.length <= 180 && !BANNED.test(t)) {
        blurbs[f.id] = t.trim()
        await prisma.eventBlurb.upsert({ where: { eventId: f.id }, create: { eventId: f.id, text: t.trim(), model: gatewayModel(), factsHash: hashFacts(f) }, update: { text: t.trim(), model: gatewayModel(), factsHash: hashFacts(f), createdAt: new Date() } })
      }
    }
    if (Array.isArray(out.subjects)) {
      const options = out.subjects.filter((x: any) => x && typeof x.subject === 'string' && SUBJECT_STYLES.includes(x.style))
      subjects = SUBJECT_STYLES.map((style) => {
        const s = options.find((x: any) => x.style === style && goodSubject(x.subject, ctx.recentSubjects, sponsoredTitles, events.map((e) => e.title))
          && !BANNED.test(String(x.preview ?? '')) && !sponsoredTitles.some((t) => String(x.preview ?? '').includes(t)))
        return s ? { style, subject: s.subject.trim(), preview: String(s.preview ?? '').trim().slice(0, 110) } : null
      }).filter(Boolean) as SubjectLine[]
    }
  } catch (e: any) {
    console.error('[newsletter] copy generation failed:', e?.message)
    source = 'fallback'
  }
  if (subjects.length < 3) {
    subjects = SUBJECT_STYLES.map((st) => subjects.find((s) => s.style === st) ?? fallbackSubject(st, ctx.city, ctx.hero, ctx.recentSubjects))
    if (source === 'ai') source = 'mixed'
  }
  for (const e of events) if (!blurbs[e.id]) { blurbs[e.id] = fallbackBlurb(e); if (source === 'ai') source = 'mixed' }
  if (!headline) headline = ctx.recentHeadlines.includes('Your couch called. We declined.') ? 'Plans? Sorted.' : 'Your couch called. We declined.'
  if (!intro) intro = `${ctx.city}'s serving up a good one. Here are the gigs, markets and unexpected gems worth leaving the house for.`
  return { headline, intro, subjects, blurbs, source }
}
