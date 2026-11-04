import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
import { runLinkedFill } from '@/lib/linked-fill-run'
import { runWithJobPrisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * Fill gaps on listings that already have another linked source.
 * Dry-run unless apply=1. Safe to repeat: filled fields are left alone.
 */
async function run(req: Request) {
  const me = await getSessionUser().catch(() => null)
  if (!cronAuthorized(req, me?.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const apply = new URL(req.url).searchParams.get('apply') === '1'
  return NextResponse.json(await runWithJobPrisma(() => runLinkedFill({ dryRun: !apply })))
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
