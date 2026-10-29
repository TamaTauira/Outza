import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { CITIES } from '@/lib/cities'
import { outingCity, outingsForCity } from '@/lib/outings-data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Day and night plans',
  description: 'Suggested days out built from real Outza listings, with dining and transport notes.',
  robots: { index: false, follow: true },
}

export default async function OutingsPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city: raw } = await searchParams
  const city = outingCity(raw)
  const plans = await outingsForCity(city)
  return (
    <PageShell>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Day and night</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold mt-2">A whole outing, not just one gig.</h1>
        <p className="mt-3 text-muted-foreground text-base sm:text-lg">These are real listings from the board, lined up with a meal idea and a transport link. Outza does not book restaurants or tickets.</p>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {CITIES.map((c) => (
            <Link key={c.name} href={`/outings?city=${encodeURIComponent(c.name)}`} className={c.name === city ? 'shrink-0 h-9 px-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center' : 'shrink-0 h-9 px-3 rounded-full border border-border text-sm inline-flex items-center'}>
              {c.name}
            </Link>
          ))}
        </div>
        <ul className="mt-6 space-y-3">
          {plans.map((plan) => (
            <li key={plan.slug}>
              <Link href={`/outings/${plan.slug}?city=${encodeURIComponent(city)}`} className="block rounded-xl border border-border bg-card p-4 hover:bg-muted">
                <h2 className="font-display text-xl font-bold">{plan.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{plan.blurb}</p>
                <p className="mt-2 text-sm">{plan.eventIds.length ? `${plan.eventIds.length} ${plan.eventIds.length === 1 ? 'stop' : 'stops'}${plan.date ? ` · ${plan.date}` : ''}` : 'Quiet on the board for this one right now.'}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </PageShell>
  )
}
