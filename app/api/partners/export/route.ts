import { NextResponse } from 'next/server'
import { requirePartner } from '@/lib/partner-auth'
import { csvWithBom } from '@/lib/organiser-reach'
import { loadPartnerCsv } from '@/lib/partner-data'
import { parsePartnerFilters } from '@/lib/partner-scope'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await requirePartner()
  if ('error' in gate) return gate.error
  const filters = parsePartnerFilters(Object.fromEntries(new URL(req.url).searchParams))
  const csv = await loadPartnerCsv(gate.partner.scope, filters)
  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(csvWithBom(csv), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="vibepeep-source-events-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
