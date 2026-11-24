import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cronAuthorized } from '@/lib/cron-auth'
import { writeHeartbeat } from '@/lib/job-watermark'
import { eventPath } from '@/lib/seo'
import { runSyntheticChecks } from '@/lib/ops/synthetic'
import { reportFault } from '@/lib/owner-alerts'
import { sydneyToday } from '@/lib/event-store'
import { getSessionUser } from '@/lib/session'
import { siteUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Hourly check of the public pages. A failure becomes a fault for the existing responder. */
async function run(req: Request) {
  const me = await getSessionUser().catch(() => null)
  if (!cronAuthorized(req, me?.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const event = await prisma.event.findFirst({
    where: { date: { gte: sydneyToday() }, duplicateOfId: null, hidden: false, OR: [{ moderationStatus: null }, { moderationStatus: 'approved' }] },
    select: { id: true, title: true, city: true },
    orderBy: { date: 'asc' },
  }).catch(() => null)
  const checks = await runSyntheticChecks({ origin: siteUrl(), eventPath: event ? eventPath(event) : null })
  const failed = checks.filter((check) => !check.ok)
  if (failed.length) {
    await reportFault({
      area: 'Synthetic checks',
      key: `synthetic-${failed.map((check) => check.name).sort().join('-')}`,
      route: '/admin/ops',
      title: `Public check failed: ${failed.map((check) => check.name).join(', ')}`,
      detail: failed.map((check) => `${check.name}: ${check.detail}`).join('\n'),
    })
  }
  await writeHeartbeat('synthetic').catch(() => {})
  return NextResponse.json({ ok: failed.length === 0, checks })
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
