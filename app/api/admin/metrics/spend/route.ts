import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseSpend, sydneyMonth } from '@/lib/commercial-metrics'
import { isMissingTable } from '@/lib/commercial-metrics-load'
import { forbidden, getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (me.role !== 'ADMIN') return forbidden()
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  const parsed = parseSpend(await req.json().catch(() => null), sydneyMonth())
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  try {
    await prisma.marketingSpend.upsert({
      where: { month: parsed.month },
      create: { month: parsed.month, amountCents: parsed.amountCents, note: parsed.note },
      update: { amountCents: parsed.amountCents, note: parsed.note },
    })
  } catch (err) {
    if (isMissingTable(err)) {
      return NextResponse.json({ error: 'The spend table isn’t on this database yet. Apply prisma/sql/20261110_commercial_metrics.sql, then try again.' }, { status: 503 })
    }
    console.error('[admin] marketing spend', err)
    return NextResponse.json({ error: 'That didn’t save. Give it another go.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
