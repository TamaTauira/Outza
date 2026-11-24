import { createHmac, createHash, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail, emailSendingEnabled, OWNER_EMAIL, escapeHtml, siteUrl } from '@/lib/email'
import { EMAIL_C, emailBodyCell, emailDocument } from '@/lib/email-brand'
import { llmConfigured, completeJson } from '@/lib/llm'

const DIGEST_KEY = 'ideas-digest'

export type IdeaEffort = 'S' | 'M' | 'L'
export type IdeaTheme = { title: string; detail: string; effort: IdeaEffort }

export function sydneyClock(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).map((part) => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
  }
}

/** 1st of the month, from 9:00am Australia/Sydney, once that month. `force` sends on demand. */
export function ideasDigestDue(now: Date, lastSent: Date | null, force = false): boolean {
  if (force) return true
  const here = sydneyClock(now)
  if (here.day !== 1 || here.hour < 9) return false
  if (!lastSent) return true
  const prev = sydneyClock(lastSent)
  return prev.year !== here.year || prev.month !== here.month
}

export function fallbackThemes(input: { suggestions: string[]; requests: string[]; searches: { query: string; count: number }[] }): IdeaTheme[] {
  const lines = [
    ...input.suggestions.map((line) => line.trim()),
    ...input.requests.map((line) => line.trim()),
    ...input.searches.filter((row) => row.count >= 2).map((row) => `People searched for “${row.query}” (${row.count} times) and didn’t open a result.`),
  ].filter(Boolean)
  return lines.slice(0, 5).map((line) => ({
    title: line.slice(0, 80),
    detail: line.slice(0, 280),
    effort: 'M' as const,
  }))
}

function ideaSecret(): string {
  return process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || ''
}

export function signIdea(theme: IdeaTheme, now = Date.now()): string | null {
  const key = ideaSecret()
  if (!key) return null
  const payload = Buffer.from(JSON.stringify({ ...theme, exp: now + 14 * 86400000 })).toString('base64url')
  const sig = createHmac('sha256', key).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function readIdea(token: string, now = Date.now()): IdeaTheme | null {
  const key = ideaSecret()
  const [payload, sig] = token.split('.')
  if (!key || !payload || !sig) return null
  const expected = createHmac('sha256', key).update(payload).digest('base64url')
  const left = Buffer.from(expected)
  const right = Buffer.from(sig)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { title?: unknown; detail?: unknown; effort?: unknown; exp?: unknown }
    if (typeof parsed.exp !== 'number' || parsed.exp < now) return null
    if (parsed.effort !== 'S' && parsed.effort !== 'M' && parsed.effort !== 'L') return null
    if (typeof parsed.title !== 'string' || typeof parsed.detail !== 'string') return null
    return { title: parsed.title.slice(0, 120), detail: parsed.detail.slice(0, 500), effort: parsed.effort }
  } catch {
    return null
  }
}

export function ideaTokenKey(token: string): string {
  return `idea-ok:${createHash('sha256').update(token).digest('hex').slice(0, 24)}`
}

function cleanTheme(raw: unknown): IdeaTheme | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as { title?: unknown; detail?: unknown; effort?: unknown }
  if (typeof row.title !== 'string' || typeof row.detail !== 'string') return null
  const effort: IdeaEffort = row.effort === 'S' || row.effort === 'L' ? row.effort : 'M'
  const title = row.title.trim().slice(0, 80)
  const detail = row.detail.trim().slice(0, 280)
  if (!title || !detail) return null
  return { title, detail, effort }
}

async function clusterThemes(input: { suggestions: string[]; requests: string[]; searches: { query: string; count: number }[] }): Promise<IdeaTheme[]> {
  const fallback = fallbackThemes(input)
  if (!fallback.length || !llmConfigured()) return fallback
  try {
    const output = await completeJson({
      timeoutMs: 20_000,
      temperature: 0.2,
      maxOutputTokens: 800,
      messages: [{
        role: 'user',
        content: `Cluster these VibePeep notes into at most 5 themes. Use only what is written. Each theme needs title, detail, and effort S, M or L. Return JSON {"themes":[{"title":"","detail":"","effort":"M"}]}.\n\nSuggestions:\n${input.suggestions.slice(0, 40).join('\n') || '(none)'}\n\nFeature requests:\n${input.requests.slice(0, 40).join('\n') || '(none)'}\n\nZero-result searches:\n${input.searches.slice(0, 20).map((row) => `${row.query} (${row.count})`).join('\n') || '(none)'}`,
      }],
    })
    const themes = Array.isArray(output.themes)
      ? output.themes.map((item: unknown) => cleanTheme(item)).filter((row: IdeaTheme | null): row is IdeaTheme => !!row).slice(0, 5)
      : []
    return themes.length ? themes : fallback
  } catch (err) {
    console.error('[ideas] cluster failed', err instanceof Error ? err.message : err)
    return fallback
  }
}

/** Monthly ideas summary. Skips the email when nothing new came in. Replaces the fortnightly send. */
export async function runIdeasDigest(opts: { force?: boolean; now?: Date } = {}) {
  if (!emailSendingEnabled()) return { sent: false, reason: 'email off' }
  const now = opts.now ?? new Date()
  const marker = await prisma.ownerAlert.findUnique({ where: { key: DIGEST_KEY } })
  if (!ideasDigestDue(now, marker?.lastEmailedAt ?? null, opts.force)) return { sent: false, reason: 'not due' }

  const since = marker?.lastEmailedAt ?? new Date(now.getTime() - 35 * 86400000)
  const [ideas, requests, searches] = await Promise.all([
    prisma.suggestion.findMany({ where: { digestedAt: null }, orderBy: { createdAt: 'asc' }, take: 200 }),
    prisma.contactMessage.findMany({
      where: { category: 'feature request', createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { message: true },
    }).catch(() => []),
    prisma.discoverySearch.findMany({
      where: { clicked: false, createdAt: { gt: since } },
      select: { queryKey: true },
      take: 1000,
    }).catch(() => []),
  ])
  const counts = new Map<string, number>()
  for (const row of searches) counts.set(row.queryKey, (counts.get(row.queryKey) ?? 0) + 1)
  const searchRows = [...counts.entries()].map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count).slice(0, 12)
  const themes = await clusterThemes({
    suggestions: ideas.map((row) => row.message),
    requests: requests.map((row) => row.message),
    searches: searchRows,
  })
  if (!themes.length) {
    if (marker) await prisma.ownerAlert.update({ where: { key: DIGEST_KEY }, data: { lastEmailedAt: now, lastSeen: now, title: 'Monthly ideas summary' } })
    else await prisma.ownerAlert.create({ data: { key: DIGEST_KEY, kind: 'IDEAS_DIGEST', title: 'Monthly ideas summary', lastEmailedAt: now } })
    return { sent: false, reason: 'nothing new' }
  }

  const home = siteUrl()
  const blocks = themes.map((theme) => {
    const token = signIdea(theme, now.getTime())
    const link = token ? `${home}/api/owner/ideas/approve?token=${encodeURIComponent(token)}` : ''
    return `<div class="card" style="background:#f6f6f6;padding:12px 14px;border-radius:8px;margin-bottom:10px;">
      <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:${EMAIL_C.ink};">${escapeHtml(theme.title)} <span style="font-weight:600;color:${EMAIL_C.muted};">(${theme.effort})</span></p>
      <p style="margin:0 0 8px;color:${EMAIL_C.ink};">${escapeHtml(theme.detail)}</p>
      ${link ? `<p style="margin:0;font-size:14px;"><a href="${escapeHtml(link)}">Approve this recommendation</a></p>` : ''}
    </div>`
  }).join('')
  const html = emailDocument({
    title: 'Your monthly ideas summary',
    preheader: `${themes.length} recommendation${themes.length === 1 ? '' : 's'}`,
    manageHref: `${home}/admin`,
    banner: 'owner-ideas',
    homeHref: home,
    reason: 'This note goes to the VibePeep owner on the 1st. An empty month sends nothing.',
    rows: emailBodyCell(`<h2 style="color:${EMAIL_C.orange};margin:0 0 8px;font-size:20px;">Your monthly ideas summary</h2>
    <p style="margin:0 0 16px;">${ideas.length} suggestion${ideas.length === 1 ? '' : 's'}, ${requests.length} feature request${requests.length === 1 ? '' : 's'}, and ${searchRows.length} search theme${searchRows.length === 1 ? '' : 's'}. Approving queues a GitHub issue. Nothing is built from here.</p>
    ${blocks}`),
  })
  const text = [
    'Your monthly ideas summary',
    ...themes.map((theme) => `${theme.title} (${theme.effort})\n${theme.detail}`),
    'Approving queues a GitHub issue. Nothing is built from here.',
  ].join('\n\n')
  const res = await sendEmail({
    to: OWNER_EMAIL,
    subject: `VibePeep ideas: ${themes.length} recommendation${themes.length === 1 ? '' : 's'} this month`,
    html,
    text,
  })
  if (!res.ok) {
    const { reportFault } = await import('@/lib/owner-alerts')
    await reportFault({ area: 'Owner emails', key: 'ideas-digest-failed', route: '/api/cron/owner-alerts', title: 'Monthly ideas summary failed to send', detail: res.error })
    return { sent: false, reason: res.error }
  }
  if (ideas.length) await prisma.suggestion.updateMany({ where: { id: { in: ideas.map((row) => row.id) } }, data: { digestedAt: now } })
  if (marker) await prisma.ownerAlert.update({ where: { key: DIGEST_KEY }, data: { lastEmailedAt: now, lastSeen: now, count: { increment: 1 }, title: 'Monthly ideas summary' } })
  else await prisma.ownerAlert.create({ data: { key: DIGEST_KEY, kind: 'IDEAS_DIGEST', title: 'Monthly ideas summary', lastEmailedAt: now, count: 1 } })
  return { sent: true, count: themes.length }
}
