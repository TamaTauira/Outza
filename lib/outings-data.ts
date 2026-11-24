import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { CITY_NAMES } from '@/lib/cities'
import { addDaysKey, cityToday } from '@/lib/seo'
import { cityDef } from '@/lib/cities'
import { buildOuting, editOutingEvents, finishOuting, OUTING_TEMPLATES, type BuiltOuting, type OutingEdit, type OutingEvent, type OutingTemplate } from '@/lib/outings'

export function outingCity(raw: string | undefined | null): string {
  return raw && CITY_NAMES.includes(raw) ? raw : 'Sydney'
}

const OUTING_SELECT = {
  id: true, title: true, date: true, time: true, endTime: true, venueName: true, suburb: true, city: true,
  category: true, isFree: true, price: true, priceMin: true, ticketUrl: true, latitude: true, longitude: true,
} as const

function clockOf(mins: number): string {
  const clamped = Math.max(0, Math.min(mins, 23 * 60 + 59))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

function datesForWeekday(from: string, weekday: number, horizon = 21): string[] {
  const days: string[] = []
  for (let i = 0; i <= horizon; i++) {
    const key = addDaysKey(from, i)
    if (new Date(`${key}T00:00:00Z`).getUTCDay() === weekday) days.push(key)
  }
  return days
}

/**
 * Listings a plan can be built from. A named weekday is loaded on its own,
 * so Saturday night is not crowded out by Wednesday morning.
 */
export async function loadOutingEvents(city: string, template?: OutingTemplate): Promise<OutingEvent[]> {
  const def = cityDef(city)
  const from = cityToday(def)
  const to = addDaysKey(from, 21)
  const and: Prisma.EventWhereInput[] = []
  if (template?.weekday != null) {
    const days = datesForWeekday(from, template.weekday)
    and.push({ OR: days.map((day) => ({ date: { gte: new Date(`${day}T00:00:00.000Z`), lt: new Date(`${addDaysKey(day, 1)}T00:00:00.000Z`) } })) })
  }
  if (template?.categories.length) and.push({ category: { in: template.categories } })
  if (template?.freeOnly) and.push({ isFree: true })
  if (template?.fromMin != null) {
    const start = clockOf(template.fromMin - 180)
    and.push(template.allowUntimed ? { OR: [{ time: { gte: start } }, { time: null }] } : { time: { gte: start } })
  }
  const rows = await prisma.event.findMany({
    where: {
      city,
      duplicateOfId: null,
      status: 'SCHEDULED',
      date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
      ...(and.length ? { AND: and } : {}),
    },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
    take: 500,
    select: OUTING_SELECT,
  })
  return rows.map((row) => ({ ...row, date: row.date.toISOString().slice(0, 10) }))
}

export async function outingsForCity(city: string): Promise<BuiltOuting[]> {
  return Promise.all(OUTING_TEMPLATES.map(async (template) => {
    const events = await loadOutingEvents(city, template)
    return buildOuting(template, events, city)
  }))
}

export async function outingBySlug(slug: string, city: string): Promise<BuiltOuting | null> {
  const template = OUTING_TEMPLATES.find((item) => item.slug === slug)
  if (!template) return null
  const events = await loadOutingEvents(city, template)
  return buildOuting(template, events, city)
}

/** Rebuilds a plan after a swap, an extra stop, a shuffle or a removal. Null when nothing else fits. */
export async function editOuting(slug: string, city: string, eventIds: string[], action: OutingEdit, replaceId?: string | null): Promise<BuiltOuting | null> {
  const template = OUTING_TEMPLATES.find((item) => item.slug === slug)
  if (!template) return null
  const pool = await loadOutingEvents(city, template)
  const byId = new Map(pool.map((ev) => [ev.id, ev]))
  const current = eventIds.map((id) => byId.get(id)).filter((ev): ev is OutingEvent => !!ev)
  if (!current.length && action !== 'add') return null
  const next = editOutingEvents(template, pool, current, action, replaceId)
  if (!next) return null
  return finishOuting(template, next, city)
}
