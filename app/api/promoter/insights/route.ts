import { NextResponse } from 'next/server'
import { getSessionUser, isPromoter, unauthorized, forbidden } from '@/lib/session'
import { getAudienceInsights } from '@/lib/audience-insights'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  try {
    return NextResponse.json(await getAudienceInsights(me.id))
  } catch (e) {
    console.error('[promoter/insights]', e)
    return NextResponse.json({ error: 'Could not load audience insights' }, { status: 500 })
  }
}
