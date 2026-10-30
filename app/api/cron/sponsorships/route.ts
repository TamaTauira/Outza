import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
import { getSessionUser } from '@/lib/session'
import { applyDueDowngrades } from '@/lib/sponsorship-billing'
import { endExpiredBoosts, missingTable } from '@/lib/sponsorship-store'

export const dynamic = 'force-dynamic'

/** Ends boosts whose window or impression cap is done, and applies scheduled plan downgrades. Idempotent. */
async function run(req: Request) {
  const me = await getSessionUser().catch(() => null)
  if (!cronAuthorized(req, me?.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  try {
    const [boosts, plans] = await Promise.all([endExpiredBoosts(), applyDueDowngrades()])
    return NextResponse.json({ ok: true, ...boosts, downgrades: plans.applied })
  } catch (error) {
    if (missingTable(error)) return NextResponse.json({ ok: false, error: 'Sponsorship tables are not installed' }, { status: 503 })
    console.error('[cron] sponsorships', error)
    return NextResponse.json({ error: 'Could not end expired boosts' }, { status: 500 })
  }
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
