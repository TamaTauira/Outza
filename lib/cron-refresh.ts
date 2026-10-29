import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { REFRESH_CHUNKS, chunkById } from '@/lib/refresh-plan'
import { runRefreshChunk } from '@/lib/refresh'

function authorized(req: Request, role?: string | null) {
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get('authorization')
  const header = req.headers.get('x-cron-secret')
  const authed = !!secret && (bearer === `Bearer ${secret}` || header === secret)
  return authed || role === 'ADMIN'
}

/**
 * One chunk per invocation. Crons call `/api/cron/refresh/<id>` with no chain.
 * A manual call with no chunk runs the first chunk, then dispatches the next so
 * the rest of the cycle continues as separate invocations.
 */
export async function handleRefreshRequest(req: Request, chunkId: string | null) {
  const me = await getSessionUser().catch(() => null)
  if (!authorized(req, me?.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const url = new URL(req.url)
  const chain = url.searchParams.get('chain') === '1' || !chunkId
  const id = chunkId ?? REFRESH_CHUNKS[0].id
  const chunk = chunkById(id)
  if (!chunk) {
    return NextResponse.json({ error: `Unknown refresh chunk: ${id}`, chunks: REFRESH_CHUNKS.map((c) => c.id) }, { status: 400 })
  }

  console.log(`[refresh] chunk ${chunk.id}`)
  const result = await runRefreshChunk(chunk.id)
  const index = REFRESH_CHUNKS.findIndex((c) => c.id === chunk.id)
  const next = REFRESH_CHUNKS[index + 1] ?? null
  const chained = chain && next ? await dispatchChunk(req, next.id) : false
  return NextResponse.json({ ...result, chunk: chunk.id, next: next?.id ?? null, chained })
}

async function dispatchChunk(req: Request, chunkId: string): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[refresh] not chaining: CRON_SECRET is not set')
    return false
  }
  const url = new URL(req.url)
  url.pathname = url.pathname.replace(/\/refresh(?:\/[^/]+)?$/, `/refresh/${chunkId}`)
  url.search = ''
  url.searchParams.set('chain', '1')
  const headers: Record<string, string> = { authorization: `Bearer ${secret}` }
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypass) headers['x-vercel-protection-bypass'] = bypass
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 8_000)
  try {
    // fetch resolves on response headers. A chunk holds those until it finishes,
    // so give the next invocation time to be accepted, then stop waiting.
    const res = await fetch(url, { headers, signal: ac.signal, cache: 'no-store' })
    await res.body?.cancel().catch(() => {})
    console.log(`[refresh] dispatched ${chunkId} (${res.status})`)
    return res.ok
  } catch (e: unknown) {
    const name = e && typeof e === 'object' && 'name' in e ? String(e.name) : ''
    if (name === 'AbortError' || ac.signal.aborted) {
      console.log(`[refresh] dispatched ${chunkId}; this invocation is not waiting for it`)
      return true
    }
    const message = e instanceof Error ? e.message : 'dispatch failed'
    console.error(`[refresh] failed to dispatch ${chunkId}:`, message)
    return false
  } finally {
    clearTimeout(timer)
  }
}
