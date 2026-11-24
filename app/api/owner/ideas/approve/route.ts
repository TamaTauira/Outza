import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ideaTokenKey, readIdea } from '@/lib/ideas-digest'

export const dynamic = 'force-dynamic'

function esc(value: string) {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c))
}

function page(title: string, body: string, token?: string) {
  const form = token
    ? `<form method="post" action="/api/owner/ideas/approve"><input type="hidden" name="token" value="${esc(token)}"/><button type="submit">Approve and queue the issue</button></form>`
    : ''
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="robots" content="noindex"/><title>${esc(title)}</title></head><body style="font-family:sans-serif;max-width:36rem;margin:40px auto;padding:0 16px;"><h1>${esc(title)}</h1><p>${esc(body)}</p>${form}</body></html>`
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } })
}

async function openIssue(title: string, body: string): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()
  if (!token) return null
  const send = (labels?: string[]) => fetch('https://api.github.com/repos/TamaTauira/Outza/issues', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'VibePeep',
    },
    body: JSON.stringify({ title, body, ...(labels ? { labels } : {}) }),
  })
  let res = await send(['owner-approved'])
  if (res.status === 422) res = await send()
  if (!res.ok) return null
  const json = await res.json().catch(() => ({})) as { html_url?: unknown }
  return typeof json.html_url === 'string' ? json.html_url : null
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') || ''
  const theme = readIdea(token)
  if (!theme) return page('That link has expired', 'Ask for a fresh monthly summary if you still want this queued.')
  return page(theme.title, `${theme.detail} Effort: ${theme.effort}. Approving queues a GitHub issue. Nothing is built from this page.`, token)
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  const token = String(form?.get('token') || '')
  const theme = readIdea(token)
  if (!theme) return page('That link has expired', 'Ask for a fresh monthly summary if you still want this queued.')
  const key = ideaTokenKey(token)
  const existing = await prisma.ownerAlert.findUnique({ where: { key } })
  if (existing) return page('Already approved', 'This recommendation was already queued.')
  const url = await openIssue(`Idea: ${theme.title}`, `${theme.detail}\n\nEffort: ${theme.effort}\n\nApproved from the monthly ideas summary.`).catch(() => null)
  await prisma.ownerAlert.create({
    data: {
      key,
      kind: 'IDEA_APPROVED',
      title: theme.title.slice(0, 180),
      detail: url || theme.detail,
    },
  })
  return page('Queued', url ? `The issue is open: ${url}` : 'Saved on VibePeep. A GitHub issue was not opened from this server.')
}
