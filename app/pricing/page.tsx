import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import { DURATIONS, LOCAL_AD, PRO_PLAN, TIERS, formatAud } from '@/lib/tiers'

export const metadata: Metadata = {
  title: 'Pricing — VibePeep',
  description: 'Boost, Spotlight, Headliner, Promoter Pro and local recommendations. AUD, GST inclusive.',
}

export default function PricingPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Pricing</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">All prices are AUD and include GST. Listing an event is free. Campaigns are a one-off payment for that event. The same packages are on the promoter page.</p>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t.key} className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm ${t.key === 'BRONZE' ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}>
              {t.key === 'BRONZE' && <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">MOST POPULAR</span>}
              <span className="h-1.5 w-12 rounded-full" style={{ backgroundColor: t.color }} />
              <p className="mt-4 font-display text-xl font-bold">{t.name}</p>
              <p className="text-sm text-muted-foreground">{t.tagline}</p>
              <p className="mt-4 text-4xl font-bold">{formatAud(t.prices[t.headlineDays])}<span className="text-sm font-normal text-muted-foreground"> / {t.headlineDays} days</span></p>
              <ul className="mt-5 flex-1 space-y-2">{t.perks.map((p) => <li key={p} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{p}</li>)}</ul>
              <Link href="/promoters" className={`mt-6 flex h-11 items-center justify-center rounded-md text-sm font-semibold ${t.key === 'BRONZE' ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'}`}>See {t.name}</Link>
            </div>
          ))}
        </div>

        <h2 id="compare" className="mt-12 scroll-mt-24 font-display text-2xl font-bold">Compare campaign lengths</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-muted/60 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Package</th>
                {DURATIONS.map((d) => <th key={d.days} className="px-4 py-3 font-medium">{d.label}</th>)}
                <th className="px-4 py-3 font-medium">Where it shows</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => (
                <tr key={t.key} className="border-t border-border">
                  <th className="px-4 py-3 font-semibold">{t.name}</th>
                  {DURATIONS.map((d) => <td key={d.days} className="px-4 py-3 font-mono">{formatAud(t.prices[d.days])}</td>)}
                  <td className="px-4 py-3 text-muted-foreground">{t.key === 'GOLD' ? 'Top of your city’s Featured band' : t.key === 'BRONZE' ? 'Featured band, above Boost' : 'Featured band in your city'}</td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <th className="px-4 py-3 font-semibold">{PRO_PLAN.name}</th>
                <td className="px-4 py-3 font-mono" colSpan={3}>{formatAud(PRO_PLAN.priceCents)} / {PRO_PLAN.days} days</td>
                <td className="px-4 py-3 text-muted-foreground">{PRO_PLAN.discountPct}% off campaigns bought while it is active. Ending it does not refund the current period.</td>
              </tr>
              <tr className="border-t border-border">
                <th className="px-4 py-3 font-semibold">Local recommendation</th>
                <td className="px-4 py-3 font-mono" colSpan={3}>{formatAud(LOCAL_AD.priceCents)}</td>
                <td className="px-4 py-3 text-muted-foreground">Runs until the event ends. One per event. Cancelling stops it showing and is not refunded automatically.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Placements are labelled Sponsored. Headliner stays in the event’s city. Front-row is the add-on that can show in every city. GST is included in every price above.</p>
        <p className="mt-6 text-sm"><Link href="/promoters" className="text-primary underline">Promoter packages and add-ons</Link><span className="text-muted-foreground"> · </span><Link href="/refunds" className="text-primary underline">Refunds</Link></p>
      </main>
    </PageShell>
  )
}
