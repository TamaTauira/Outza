import { prisma } from '@/lib/db'
import { CITY_NAMES } from '@/lib/cities'
import { addDaysKey, cityToday } from '@/lib/seo'
import { cityDef } from '@/lib/cities'
import { buildOuting, OUTING_TEMPLATES, type BuiltOuting, type OutingEvent } from '@/lib/outings'

export function outingCity(raw: string | undefined | null): string {
  return raw && CITY_NAMES.includes(raw) ? raw : 'Sydney'
}

export async function loadOutingEvents(city: string): Promise<OutingEvent[]> {
  const def = cityDef(city)
  const from = cityToday(def)
  const to = addDaysKey(from, 21)
  const rows = await prisma.event.findMany({
    where: {
      city,
      duplicateOfId: null,
      status: 'SCHEDULED',
      date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
    },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
    take: 400,
    select: {
      id: true, title: true, date: true, time: true, endTime: true, venueName: true, suburb: true, city: true,
      category: true, isFree: true, price: true, priceMin: true, ticketUrl: true,
    },
  })
  return rows.map((row) => ({ ...row, date: row.date.toISOString().slice(0, 10) }))
}

export async function outingsForCity(city: string): Promise<BuiltOuting[]> {
  const events = await loadOutingEvents(city)
  return OUTING_TEMPLATES.map((template) => buildOuting(template, events, city))
}

export async function outingBySlug(slug: string, city: string): Promise<BuiltOuting | null> {
  const template = OUTING_TEMPLATES.find((item) => item.slug === slug)
  if (!template) return null
  const events = await loadOutingEvents(city)
  return buildOuting(template, events, city)
}
