import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
import { PRICE_ENRICH_BUDGET_MS, runPriceEnrich } from '@/lib/price-enrich'
import { runWithJobPrisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * One chunk of price lookups. Separate from /api/cron/refresh so it cannot
 * extend the listings refresh or the finalize step.
 */
async function run(req: Request) {
  const me = await getSessionUser().catch(() => null)
  if (!cronAuthorized(req, me?.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const requested = Number(new URL(req.url).searchParams.get('budgetMs'))
  const budgetMs = Number.isFinite(requested) && requested > 5_000 ? Math.min(requested, PRICE_ENRICH_BUDGET_MS) : PRICE_ENRICH_BUDGET_MS
  const report = await runWithJobPrisma(() => runPriceEnrich({ budgetMs }))
  return NextResponse.json(report)
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
