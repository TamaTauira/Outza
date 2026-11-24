import { NextRequest, NextResponse } from 'next/server'
import { legsBetween, outingTemplate, type OutingEdit, type OutingStop } from '@/lib/outings'
import { editOuting, outingBySlug, outingCity } from '@/lib/outings-data'
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
    return NextResponse.json({ error: 'The planner’s having a moment. Give it another go.' }, { status: 500 })
  }
}

const EDITS = new Set<OutingEdit>(['swap', 'add', 'shuffle', 'remove'])

function planBody(plan: NonNullable<Awaited<ReturnType<typeof editOuting>>>) {
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
  return body
}

/** Swap a stop, add one, shuffle or remove one. Hops are recomputed from the new order. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const slug = String(body?.slug ?? '')
  const action = body?.action as OutingEdit
  if (!outingTemplate(slug) || !EDITS.has(action)) {
    return NextResponse.json({ error: 'That plan is not on the menu.' }, { status: 400 })
  }
  const city = outingCity(typeof body?.city === 'string' ? body.city : '')
  const eventIds = Array.isArray(body?.eventIds) ? body.eventIds.map((id: unknown) => String(id)).filter(Boolean).slice(0, 8) : []
  const replaceId = typeof body?.replaceId === 'string' ? body.replaceId : null
  try {
    const plan = await editOuting(slug, city, eventIds, action, replaceId)
    if (!plan) return NextResponse.json({ error: 'Nothing else fits that slot.' }, { status: 404 })
    return NextResponse.json({ plan: planBody(plan) })
  } catch (err) {
    console.error('outings edit failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'The planner’s having a moment. Give it another go.' }, { status: 500 })
  }
}
