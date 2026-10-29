import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/page-shell'
import { outingTemplate } from '@/lib/outings'
import { outingBySlug, outingCity } from '@/lib/outings-data'
import { eventPath } from '@/lib/seo'
import { OutingActions } from './outing-actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ city?: string }> }): Promise<Metadata> {
  const { slug } = await params
  const template = outingTemplate(slug)
  const { city } = await searchParams
  return {
    title: template ? `${template.title} in ${outingCity(city)}` : 'Day plan',
    robots: { index: false, follow: true },
  }
}

export default async function OutingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ city?: string }> }) {
  const { slug } = await params
  const { city: raw } = await searchParams
  if (!outingTemplate(slug)) notFound()
  const city = outingCity(raw)
  const plan = await outingBySlug(slug, city)
  if (!plan) notFound()
  return (
    <PageShell>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Link href={`/outings?city=${encodeURIComponent(city)}`} className="text-sm text-muted-foreground hover:text-foreground">All day and night plans</Link>
        <h1 className="font-display text-3xl sm:text-4xl font-bold mt-2">{plan.title}</h1>
        <p className="mt-2 text-muted-foreground">{plan.city}{plan.date ? ` · ${plan.date}` : ''}</p>
        <p className="mt-3 text-base">{plan.blurb}</p>
        {!plan.stops.length && (
          <p className="mt-6 rounded-xl bg-card border border-border p-4 text-sm text-muted-foreground">Nothing on the board fits this plan in the next few weeks. Try another city, or browse the board.</p>
        )}
        <ol className="mt-6 space-y-3">
          {plan.stops.map((stop, i) => (
            <li key={stop.kind === 'event' ? stop.event.id : `${stop.tip}-${i}`} className="rounded-xl border border-border bg-card p-4">
              {stop.kind === 'event' ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Stop</p>
                  <Link href={eventPath(stop.event)} className="font-semibold text-lg hover:text-primary">{stop.event.title}</Link>
                  <p className="text-sm text-muted-foreground mt-1">
                    {stop.event.date}{stop.event.time ? ` · ${stop.event.time}` : ' · time not listed'} · {stop.event.venueName}
                    {stop.event.suburb ? `, ${stop.event.suburb}` : ''}
                  </p>
                  <p className="text-sm mt-1">{stop.event.category} · {stop.event.isFree ? 'Listed as free' : (stop.event.price || 'Price on the listing')}</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stop.tip === 'dining' ? 'Dining note' : 'Transport note'}</p>
                  <p className="mt-1 text-sm">{stop.text}</p>
                  <a href={stop.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-primary underline">
                    {stop.tip === 'dining' ? 'Search nearby food' : 'Open the trip planner'}
                  </a>
                </div>
              )}
            </li>
          ))}
        </ol>
        <OutingActions plan={{ title: plan.title, city: plan.city, date: plan.date, events: plan.stops.flatMap((stop) => stop.kind === 'event' ? [stop.event] : []) }} />
      </main>
    </PageShell>
  )
}
