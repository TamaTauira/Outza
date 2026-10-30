import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { listPromoterCampaigns, missingTable } from '@/lib/sponsorship-store'
import { prisma } from '@/lib/db'
import { isProActive } from '@/lib/promotions'

export const dynamic = 'force-dynamic'

const cell = (value: unknown) => {
  const text = value == null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Campaign results as CSV. Growth and Venue Plus only. */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  try {
    const user = await prisma.user.findUnique({ where: { id: me.id }, select: { proUntil: true } })
    const report = await listPromoterCampaigns(me.id, isProActive(user?.proUntil))
    if (!report.canExport) return NextResponse.json({ error: 'The CSV export comes with Growth or Venue Plus.' }, { status: 403 })
    const header = ['event', 'placement', 'city', 'category', 'status', 'starts', 'ends', 'impressions', 'impressionCap', 'detailViews', 'ticketClicks', 'repeatInterest', 'spendCapCents', 'amountCents']
    const lines = report.campaigns.map((row) => [
      row.eventTitle, row.inventoryName, row.city, row.category, row.status,
      row.startsAt.toISOString(), row.endsAt.toISOString(), row.impressions, row.impressionCap,
      row.detailViews, row.ticketClicks, row.repeatInterest, row.spendCapCents, row.amountCents,
    ].map(cell).join(','))
    const csv = [header.join(','), ...lines].join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="vibepeep-boosts.csv"',
      },
    })
  } catch (error) {
    if (missingTable(error)) return NextResponse.json({ error: 'Short boosts are not switched on yet.' }, { status: 503 })
    console.error('[sponsorship] export', error)
    return NextResponse.json({ error: 'Could not export boosts.' }, { status: 500 })
  }
}
