import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/page-shell'
import { OutingItinerary } from '@/components/outing-itinerary'
import { legsBetween, outingTemplate } from '@/lib/outings'
import { outingBySlug, outingCity } from '@/lib/outings-data'
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
        {!plan.stops.length ? (
          <p className="mt-6 rounded-xl bg-card border border-border p-4 text-sm text-muted-foreground">Nothing on the board fits this plan in the next few weeks. Try another city, or browse the board.</p>
        ) : (
          <>
            <div className="mt-6">
              <OutingItinerary
                tone="page"
                stops={plan.stops}
                legs={legsBetween(plan.stops.flatMap((stop) => (stop.kind === 'event' ? [stop.event] : [])))}
              />
            </div>
            {plan.stops.filter((stop) => stop.kind === 'event').length > 1 && (
              <p className="mt-3 text-xs text-muted-foreground">Travel times are rough estimates from the distance between stops. They don&apos;t include traffic or timetables, so open Directions for a live route.</p>
            )}
          </>
        )}
        <OutingActions plan={{ title: plan.title, city: plan.city, date: plan.date, events: plan.stops.flatMap((stop) => stop.kind === 'event' ? [stop.event] : []) }} />
      </main>
    </PageShell>
  )
}
