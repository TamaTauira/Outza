import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { MetricTrend, type TrendPoint } from '@/components/metric-trend'
import { SpendForm } from './spend-form'
import { loadCommercialMetrics, type Dashboard } from '@/lib/commercial-metrics-load'
import {
  shortDay,
  shortMonth,
  sydneyDay,
  sydneyMonth,
  trackingLabel,
  trendDelta,
  weekStartMonday,
} from '@/lib/commercial-metrics'
import { formatAudCents } from '@/lib/tiers'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Metrics — VibePeep admin', robots: { index: false } }

function count(n: number) {
  return n.toLocaleString('en-AU')
}

function pct(n: number | null) {
  return n == null ? '—' : `${n}%`
}

function afterStart(period: string, started: Date | null, value: number | null, kind: 'month' | 'week') {
  if (value == null) return null
  if (!started) return value > 0 ? value : null
  const mark = kind === 'month' ? sydneyMonth(started) : weekStartMonday(sydneyDay(started))
  return period >= mark ? value : null
}

function Card({ title, value, detail, hint, tracking, points, caption, seriesLabel, compareLabel, children }: {
  title: string
  value: string
  detail?: string | null
  hint: string
  tracking?: string | null
  points: TrendPoint[]
  caption: string
  seriesLabel?: string
  compareLabel?: string
  children?: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-xs uppercase tracking-wide text-muted-foreground">{title}</h2>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
      <MetricTrend points={points} caption={caption} seriesLabel={seriesLabel} compareLabel={compareLabel} />
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      {tracking && <p className="mt-1 text-xs font-medium text-foreground">{tracking}</p>}
      {children}
    </section>
  )
}

function present(data: Dashboard) {
  const monthLabel = (month: string) => shortMonth(month)
  const mauPoints = data.mau.map((row) => ({ label: monthLabel(row.month), value: afterStart(row.month, data.audienceStarted, row.n, 'month') }))
  const returnPoints = data.returning.map((row) => ({
    label: shortDay(row.week),
    value: afterStart(row.week, data.audienceStarted, row.returning, 'week'),
  }))
  const cataloguePoints = data.catalogue.map((row) => ({ label: monthLabel(row.month), value: row.total }))
  const accuracyPoints = data.accuracy.map((row) => ({ label: monthLabel(row.month), value: row.pct }))
  const discoveryPoints = data.discovery.map((row) => ({
    label: shortDay(row.week),
    value: afterStart(row.week, data.discoveryStarted, row.pct, 'week'),
  }))
  const emailPoints = data.email.map((row) => ({ label: monthLabel(row.month), value: row.open, compare: row.click }))
  const cacPoints = data.payers.map((row) => ({ label: monthLabel(row.month), value: row.cac == null ? null : row.cac / 100 }))
  const eachPoints = data.payers.map((row) => ({ label: monthLabel(row.month), value: row.each == null ? null : row.each / 100 }))
  const mrrPoints = data.mrr.map((row) => ({ label: monthLabel(row.month), value: row.mrrCents / 100 }))

  const mauNow = data.mau.find((row) => row.month === data.currentMonth)
  const backNow = data.returning[data.returning.length - 1]
  const catalogueNow = data.catalogue[data.catalogue.length - 1]
  const accuracyNow = data.accuracy.find((row) => row.month === data.currentMonth)
  const discoveryNow = [...data.discovery].reverse().find((row) => row.searches > 0) ?? data.discovery[data.discovery.length - 1]
  const emailNow = [...data.email].reverse().find((row) => row.sent > 0) ?? data.email[data.email.length - 1]
  const payNow = data.payers.find((row) => row.month === data.currentMonth)
  const mrrNow = data.mrr.find((row) => row.month === data.currentMonth)
  const audienceNote = data.audienceReady ? (trackingLabel(data.audienceStarted) ?? 'Tracking starts with the next visitor.') : null
  const discoveryNote = data.discoveryReady ? (trackingLabel(data.discoveryStarted) ?? 'Tracking starts with the next search.') : null
  const backRate = backNow?.rate == null ? null : Math.round(backNow.rate * 1000) / 10

  return { mauPoints, returnPoints, cataloguePoints, accuracyPoints, discoveryPoints, emailPoints, cacPoints, eachPoints, mrrPoints, mauNow, backNow, backRate, catalogueNow, accuracyNow, discoveryNow, emailNow, payNow, mrrNow, audienceNote, discoveryNote }
}

export default async function MetricsAdminPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin/metrics')
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold mb-2">Admins only</h1>
        <p className="text-muted-foreground">These numbers are for the site owner.</p>
      </main>
    )
  }

  let data: Dashboard | null = null
  let error = ''
  try {
    data = await loadCommercialMetrics()
  } catch (err) {
    console.error('[admin] metrics', err)
    error = 'The numbers didn’t load. Give it another go in a moment.'
  }
  const view = data ? present(data) : null
  const trust = data?.trust

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <p className="text-sm"><Link href="/admin" className="text-primary hover:underline">Admin</Link></p>
      <h1 className="mt-2 font-display text-3xl font-bold">The numbers</h1>
      <p className="mt-1 text-sm text-muted-foreground">Who’s coming back, whether the listings hold up, and what the paying businesses are worth. Eight of these already live in the database. Monthly marketing spend is the one you type in.</p>
      {error && <p className="mt-4 rounded-lg border border-border p-4 text-sm">{error}</p>}
      {data?.setup && <p className="mt-4 rounded-lg border border-border p-4 text-sm">{data.setup}</p>}
      {view && data && (
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          <Card
            title="Monthly active users"
            value={!data.audienceReady || !data.audienceStarted ? '—' : count(view.mauNow?.n ?? 0)}
            detail={trendDelta(view.mauPoints.map((point) => point.value))}
            hint="People with a peep this month. One anonymous id per browser, counted once a day."
            tracking={view.audienceNote}
            points={view.mauPoints}
            caption="Monthly active users"
          />
          <Card
            title="Weekly returning users"
            value={!data.audienceReady || !data.audienceStarted ? '—' : count(view.backNow?.returning ?? 0)}
            detail={view.backRate == null ? 'Nobody to welcome back until a week has a before.' : `${view.backRate}% of last week’s visitors came back`}
            hint={`${count(view.backNow?.active ?? 0)} people showed up this week. A return means they were here last week too.`}
            tracking={view.audienceNote}
            points={view.returnPoints}
            caption="Weekly returning visitors"
          />
          <Card
            title="Events indexed"
            value={count(view.catalogueNow?.total ?? 0)}
            detail={trendDelta(view.cataloguePoints.map((point) => point.value))}
            hint={`${count(view.catalogueNow?.added ?? 0)} added this month. Live catalogue only: duplicates and removed listings stay out.`}
            points={view.cataloguePoints}
            caption="Events in the catalogue"
          />
          <Card
            title="Event accuracy"
            value={pct(view.accuracyNow?.pct ?? null)}
            detail={trendDelta(view.accuracyPoints.map((point) => point.value))}
            hint={`This month: ${count(trust?.reports ?? 0)} correction reports, ${count(trust?.flags ?? 0)} quality flags, ${count(trust?.checks ?? 0)} verification flags. Duplicates are ${pct(trust?.duplicatePct ?? null)} of stored rows. ${pct(trust?.expiredPct ?? null)} of listings still in the window have already ended. Dates that have passed are hidden from the board and are not in that rate.`}
            points={view.accuracyPoints}
            caption="Share of the catalogue with no correction, flag, expiry or duplicate that month"
          />
          <Card
            title="Search-to-event"
            value={pct(view.discoveryNow?.pct ?? null)}
            detail={trendDelta(view.discoveryPoints.map((point) => point.value))}
            hint={`${count(view.discoveryNow?.clicks ?? 0)} of ${count(view.discoveryNow?.searches ?? 0)} searches opened an event. The words people typed are not stored.`}
            tracking={view.discoveryNote}
            points={view.discoveryPoints}
            caption="Searches that opened an event"
          />
          <Card
            title="Email open and click"
            value={view.emailNow?.open == null ? '—' : `${view.emailNow.open}% open`}
            detail={view.emailNow?.click == null ? 'No edition has gone out in this window.' : `${view.emailNow.click}% clicked · ${count(view.emailNow.sent)} sent`}
            hint="Opens come from the tracking image and from Resend when a webhook is set. Clicks are people, not every tap, so one keen reader still counts once. Opens are approximate."
            points={view.emailPoints}
            caption="Email open rate and click rate"
            seriesLabel="Open"
            compareLabel="Click"
          />
          <Card
            title="Customer acquisition cost"
            value={view.payNow?.cac == null ? '—' : formatAudCents(view.payNow.cac)}
            detail={trendDelta(view.cacPoints.map((point) => point.value))}
            hint={view.payNow?.spend == null
              ? 'Add this month’s marketing spend and this becomes that spend divided by businesses paying us for the first time.'
              : view.payNow.fresh === 0
                ? `${formatAudCents(view.payNow.spend)} is in, and no business paid us for the first time.`
                : `${formatAudCents(view.payNow.spend)} across ${count(view.payNow.fresh)} new paying businesses.`}
            points={view.cacPoints}
            caption="Customer acquisition cost in dollars"
          >
            {data.spendReady && (
              <SpendForm
                currentMonth={data.currentMonth}
                saved={data.savedSpend.map((row) => ({ month: row.month, amount: (row.amountCents / 100).toFixed(2), note: row.note }))}
              />
            )}
          </Card>
          <Card
            title="Revenue per paying business"
            value={view.payNow?.each == null ? '—' : formatAudCents(view.payNow.each)}
            detail={trendDelta(view.eachPoints.map((point) => point.value))}
            hint={view.payNow
              ? `${formatAudCents(view.payNow.revenue)} from ${count(view.payNow.payers)} paying businesses this month. Card payments only. A quote is not a payment.`
              : 'Card payments only.'}
            points={view.eachPoints}
            caption="Revenue per paying business in dollars"
          />
          <Card
            title="Monthly recurring revenue"
            value={formatAudCents(view.mrrNow?.mrrCents ?? 0)}
            detail={trendDelta(view.mrrPoints.map((point) => point.value))}
            hint={`Same rule as Sponsorship: active plans that aren’t set to cancel. ${count(view.mrrNow?.subscribers ?? 0)} renewing. Earlier months are rebuilt from when each plan started and when it last changed.`}
            points={view.mrrPoints}
            caption="Monthly recurring revenue in dollars"
          />
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Visitor ids are random and stay in our database. No third-party tracker. Point a Resend webhook at /api/webhooks/resend and set RESEND_WEBHOOK_SECRET if you want their opens and clicks on the same edition rows.</p>
    </main>
  )
}
