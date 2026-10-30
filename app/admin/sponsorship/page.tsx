import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { sponsorshipMetrics } from '@/lib/sponsorship-metrics'
import { formatAudCents } from '@/lib/tiers'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sponsorship — Admin', robots: { index: false } }

function pct(value: number | null) {
  if (value == null) return '—'
  return `${Math.round(value * 1000) / 10}%`
}

export default async function SponsorshipAdminPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin/sponsorship')
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold mb-2">Admins only</h1>
        <p className="text-muted-foreground">These counters are for the site owner.</p>
      </main>
    )
  }
  let metrics: Awaited<ReturnType<typeof sponsorshipMetrics>> | null = null
  let error = ''
  try {
    metrics = await sponsorshipMetrics()
  } catch (err) {
    console.error('[admin] sponsorship', err)
    error = 'The sponsorship tables are not on this database yet. Apply prisma/sql/20261030_sponsorships.sql, then reload.'
  }
  const cards = metrics ? [
    { label: 'Paying organisers', value: String(metrics.payingOrganisers), hint: 'Live Stripe boost, package or plan' },
    { label: '90-day repeat purchase', value: pct(metrics.repeatPurchase90d.rate), hint: `${metrics.repeatPurchase90d.repeat} of ${metrics.repeatPurchase90d.paying} organisers bought twice` },
    { label: 'MRR', value: formatAudCents(metrics.mrr.mrrCents), hint: `${metrics.mrr.subscribers} renewing · ${metrics.mrr.cancelling} cancelling` },
    { label: 'Campaign gross margin', value: pct(metrics.margin.margin), hint: `${formatAudCents(metrics.margin.revenueCents)} revenue after estimated card fees of ${formatAudCents(metrics.margin.feeCents)}` },
  ] : []
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <p className="text-sm"><Link href="/admin" className="text-primary hover:underline">Admin</Link></p>
      <h1 className="mt-2 font-display text-3xl font-bold">Sponsorship</h1>
      <p className="mt-1 text-sm text-muted-foreground">Card payments only. Test-mode packages are left out. Margin is revenue minus an estimated 1.7% + 30c card fee. The placement itself is our inventory, so this is not a full profit-and-loss.</p>
      {error && <p className="mt-4 rounded-lg border border-border p-4 text-sm">{error}</p>}
      {!!cards.length && (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <li key={card.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{card.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
            </li>
          ))}
        </ul>
      )}
      {metrics && <p className="mt-4 text-xs text-muted-foreground">{metrics.quoteRequests} quote request{metrics.quoteRequests === 1 ? '' : 's'} saved. A quote is not a charge.</p>}
    </main>
  )
}
