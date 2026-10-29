import { NextRequest, NextResponse } from 'next/server'
import { legsBetween, outingTemplate, type OutingStop } from '@/lib/outings'
import { outingBySlug, outingCity } from '@/lib/outings-data'
import type { PlanView, PlanViewStop } from '@/lib/plan-picks'

export const dynamic = 'force-dynamic'

function viewStop(stop: OutingStop): PlanViewStop {
  if (stop.kind === 'tip') return { kind: 'tip', tip: stop.tip, text: stop.text, href: stop.href }
  const event = stop.event
  return {
    kind: 'event',
    event: {
      id: event.id,
      title: event.title,
      date: event.date,
      time: event.time,
      venueName: event.venueName,
      suburb: event.suburb ?? null,
      category: event.category,
      isFree: event.isFree,
      price: event.price ?? null,
    },
  }
}

/** One ready-made day plan for the city, with a travel line between event stops. */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') ?? ''
  if (!outingTemplate(slug)) return NextResponse.json({ error: 'That plan is not on the menu.' }, { status: 404 })
  const city = outingCity(req.nextUrl.searchParams.get('city'))
  try {
    const plan = await outingBySlug(slug, city)
    if (!plan) return NextResponse.json({ error: 'That plan is not on the menu.' }, { status: 404 })
    const events = plan.stops.flatMap((stop) => (stop.kind === 'event' ? [stop.event] : []))
    const body: PlanView = {
      slug: plan.slug,
      title: plan.title,
      blurb: plan.blurb,
      city: plan.city,
      date: plan.date,
      href: `/outings/${plan.slug}?city=${encodeURIComponent(plan.city)}`,
      stops: plan.stops.map(viewStop),
      legs: legsBetween(events),
    }
    return NextResponse.json({ plan: body })
  } catch (err) {
    console.error('outings plan failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'The planner is having a moment. Try again.' }, { status: 500 })
  }
}
