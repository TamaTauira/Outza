import { NextResponse } from 'next/server'
import { requirePartner } from '@/lib/partner-auth'
import { loadPartnerOverview } from '@/lib/partner-data'
import { parsePartnerFilters } from '@/lib/partner-scope'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await requirePartner()
  if ('error' in gate) return gate.error
  const filters = parsePartnerFilters(Object.fromEntries(new URL(req.url).searchParams))
  const overview = await loadPartnerOverview({
    displayName: gate.partner.displayName,
    scope: gate.partner.scope,
    engagement: filters.engagement,
  })
  return NextResponse.json(overview)
}
