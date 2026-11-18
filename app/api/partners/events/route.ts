import { NextResponse } from 'next/server'
import { requirePartner } from '@/lib/partner-auth'
import { loadPartnerEvents } from '@/lib/partner-data'
import { parsePartnerFilters } from '@/lib/partner-scope'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await requirePartner()
  if ('error' in gate) return gate.error
  const filters = parsePartnerFilters(Object.fromEntries(new URL(req.url).searchParams))
  const list = await loadPartnerEvents(gate.partner.scope, filters)
  return NextResponse.json(list)
}
