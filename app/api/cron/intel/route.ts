import { after, NextResponse } from 'next/server'
import { runDueSources } from '@/lib/intel/ingest'
import { IMPORT_BUDGET_MS, resumeStep, shouldResumeImport } from '@/lib/intel/schedule'
import { getSessionUser } from '@/lib/session'
import { writeHeartbeat } from '@/lib/job-watermark'

export const dynamic = 'force-dynamic'
// Imports stop 60s before this limit so a slow ABS call or row cleanup can still save partial status.
export const maxDuration = 300

/** Runs any VibePeep Intelligence source that is due. Vercel Cron calls GET with Authorization: Bearer CRON_SECRET. */
async function run(req: Request) {
  const started = Date.now()
  const url = new URL(req.url)
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get('authorization')
  const header = req.headers.get('x-cron-secret')
  const me = await getSessionUser().catch(() => null)
  const authed = !!secret && (bearer === `Bearer ${secret}` || header === secret)
  if (!authed && me?.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const step = resumeStep(url.searchParams.get('resume'))
  const deadline = started + IMPORT_BUDGET_MS
  // A follow-up slice answers immediately and works after the response, so the caller
  // is not held open until this slice hits the function limit.
  if (step > 0) {
    after(async () => {
      const ran = await runDueSources(deadline)
      if (secret) await pokeNext(url.origin, secret, ran, step)
    })
    return NextResponse.json({ queued: true, step })
  }

  const ran = await runDueSources(deadline)
  if (secret && shouldResumeImport(ran, step)) {
    after(() => pokeNext(url.origin, secret, ran, step))
  }
  await writeHeartbeat('intel').catch(() => {})
  return NextResponse.json({ ran })
}

async function pokeNext(origin: string, secret: string, ran: Record<string, string>, step: number) {
  if (!shouldResumeImport(ran, step)) return
  const next = new URL('/api/cron/intel', origin)
  next.searchParams.set('resume', String(step + 1))
  await fetch(next, { headers: { authorization: `Bearer ${secret}` } }).catch(() => {})
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
