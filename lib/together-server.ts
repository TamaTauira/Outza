import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { ensureGuestKey, readGuestKey } from '@/lib/guest'
import { canChangePrivateStop, cleanDisplayName, cleanPlanName, cleanPrivateStop, newPlanToken, orderPlanStops, planDateKey } from '@/lib/together'
import { CITY_NAMES } from '@/lib/cities'
import { locateAddress } from '@/lib/geocode'
import { coordsFitCity } from '@/lib/travel'

const eventSelect = {
  id: true, title: true, date: true, endDate: true, time: true, endTime: true, venueName: true, venueAddress: true, suburb: true,
  city: true, category: true, isFree: true, price: true, ticketUrl: true, imageUrl: true, latitude: true, longitude: true,
} as const

export type Actor = { userId: string | null; guestKey: string | null; name: string }

export async function actor(): Promise<Actor> {
  const me = await getSessionUser().catch(() => null)
  const guestKey = await readGuestKey()
  if (me) {
    if (guestKey) await claimGuest(me.id, guestKey)
    const name = cleanDisplayName(me.name || me.email.split('@')[0] || 'You', 'You')
    return { userId: me.id, guestKey: null, name }
  }
  const key = guestKey ?? await ensureGuestKey()
  return { userId: null, guestKey: key, name: 'Guest' }
}

async function claimGuest(userId: string, guestKey: string) {
  const members = await prisma.togetherMember.findMany({ where: { guestKey }, select: { id: true, planId: true } })
  for (const member of members) {
    const existing = await prisma.togetherMember.findFirst({ where: { planId: member.planId, userId }, select: { id: true } })
    if (existing) await prisma.togetherMember.delete({ where: { id: member.id } })
    else await prisma.togetherMember.update({ where: { id: member.id }, data: { userId, guestKey: null } })
  }
  const votes = await prisma.togetherVote.findMany({ where: { guestKey }, select: { id: true, planId: true } })
  for (const vote of votes) {
    const existing = await prisma.togetherVote.findFirst({ where: { planId: vote.planId, userId }, select: { id: true } })
    if (existing) await prisma.togetherVote.delete({ where: { id: vote.id } })
    else await prisma.togetherVote.update({ where: { id: vote.id }, data: { userId, guestKey: null } })
  }
  await prisma.togetherPlan.updateMany({ where: { creatorGuest: guestKey, creatorId: null }, data: { creatorId: userId, creatorGuest: null } })
  const stops = await prisma.togetherItem.findMany({ where: { addedByGuest: guestKey }, select: { id: true } })
  if (stops.length) await prisma.togetherItem.updateMany({ where: { id: { in: stops.map((s) => s.id) } }, data: { addedById: userId, addedByGuest: null } })
}

export async function listMyPlans(who: Actor) {
  const or = [
    ...(who.userId ? [{ creatorId: who.userId }, { members: { some: { userId: who.userId } } }] : []),
    ...(who.guestKey ? [{ creatorGuest: who.guestKey }, { members: { some: { guestKey: who.guestKey } } }] : []),
  ]
  if (!or.length) return []
  return prisma.togetherPlan.findMany({
    where: { OR: or },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    select: { id: true, token: true, name: true, city: true, planDate: true, updatedAt: true, _count: { select: { items: true, votes: true } } },
  })
}

type PlanRow = {
  token: string
  name: string
  city: string | null
  planDate: Date | null
  creatorId: string | null
  creatorGuest: string | null
  items: {
    id: string
    title: string | null
    address: string | null
    note: string | null
    startTime: string | null
    endTime: string | null
    stopDate: Date | null
    latitude: number | null
    longitude: number | null
    addedById: string | null
    addedByGuest: string | null
    event: {
      id: string
      title: string
      date: Date
      endDate: Date | null
      time: string | null
      endTime: string | null
      venueName: string
      venueAddress: string | null
      suburb: string | null
      city: string
      category: string
      latitude: number | null
      longitude: number | null
    } | null
  }[]
  votes: { itemId: string; userId: string | null; guestKey: string | null }[]
  members: { name: string; userId: string | null; guestKey: string | null }[]
}

function planPayload(plan: PlanRow, who: Actor) {
  const mine = (row: { userId: string | null; guestKey: string | null }) =>
    (!!who.userId && row.userId === who.userId) || (!!who.guestKey && row.guestKey === who.guestKey)
  const isCreator = (!!who.userId && plan.creatorId === who.userId) || (!!who.guestKey && plan.creatorGuest === who.guestKey)
  const counts = new Map<string, number>()
  for (const vote of plan.votes) counts.set(vote.itemId, (counts.get(vote.itemId) ?? 0) + 1)
  const myVote = plan.votes.find(mine)?.itemId ?? null
  const rows: {
    id: string
    kind: 'event' | 'private'
    votes: number
    mine: boolean
    canEdit: boolean
    eventId: string | null
    title: string
    date: string | null
    time: string | null
    endTime: string | null
    place: string | null
    note: string | null
    venueName: string | null
    suburb: string | null
    city: string | null
    category: string | null
    lat: number | null
    lng: number | null
  }[] = []
  for (const item of plan.items) {
    const votes = counts.get(item.id) ?? 0
    const picked = myVote === item.id
    if (item.event) {
      const event = item.event
      const pinned = event.latitude != null && event.longitude != null && coordsFitCity(event.latitude, event.longitude, event.city)
      rows.push({
        id: item.id, kind: 'event', votes, mine: picked, canEdit: false, eventId: event.id, title: event.title,
        date: event.date.toISOString().slice(0, 10), time: event.time, endTime: event.endTime,
        place: event.venueAddress || event.venueName, note: null, venueName: event.venueName, suburb: event.suburb,
        city: event.city, category: event.category, lat: pinned ? event.latitude : null, lng: pinned ? event.longitude : null,
      })
    } else if (item.title) {
      rows.push({
        id: item.id, kind: 'private', votes, mine: picked, canEdit: canChangePrivateStop(who, item, isCreator), eventId: null,
        title: item.title, date: item.stopDate ? item.stopDate.toISOString().slice(0, 10) : null, time: item.startTime, endTime: item.endTime,
        place: item.address, note: item.note, venueName: item.title, suburb: null, city: plan.city, category: null,
        lat: item.latitude, lng: item.longitude,
      })
    }
  }
  const items = orderPlanStops(rows)
  return {
    token: plan.token,
    name: plan.name,
    city: plan.city,
    planDate: plan.planDate ? plan.planDate.toISOString().slice(0, 10) : null,
    isCreator,
    me: plan.members.find(mine)?.name ?? who.name,
    members: plan.members.map((m) => m.name),
    myVote,
    items,
  }
}

export async function loadPlan(token: string, who: Actor) {
  const plan = await prisma.togetherPlan.findUnique({
    where: { token },
    include: {
      items: { orderBy: { createdAt: 'asc' }, include: { event: { select: eventSelect } } },
      votes: { select: { itemId: true, userId: true, guestKey: true } },
      members: { select: { name: true, userId: true, guestKey: true } },
    },
  })
  if (!plan) return null
  await touchMember(plan.id, who)
  const fresh = await prisma.togetherPlan.findUnique({
    where: { id: plan.id },
    include: {
      items: { orderBy: { createdAt: 'asc' }, include: { event: { select: eventSelect } } },
      votes: { select: { itemId: true, userId: true, guestKey: true } },
      members: { select: { name: true, userId: true, guestKey: true } },
    },
  })
  if (!fresh) return null
  return planPayload(fresh, who)
}

async function touchMember(planId: string, who: Actor, name?: string) {
  const where = who.userId ? { planId, userId: who.userId } : { planId, guestKey: who.guestKey }
  const existing = await prisma.togetherMember.findFirst({ where, select: { id: true, name: true } })
  const display = cleanDisplayName(name, existing?.name || who.name)
  if (existing) {
    if (name && existing.name !== display) await prisma.togetherMember.update({ where: { id: existing.id }, data: { name: display } })
    return
  }
  await prisma.togetherMember.create({
    data: { planId, userId: who.userId, guestKey: who.userId ? null : who.guestKey, name: display },
  })
}

export async function createPlan(who: Actor, input: { name?: unknown; city?: unknown; planDate?: unknown; eventIds?: unknown }) {
  const name = cleanPlanName(input.name)
  if (!name) return { error: 'Give the plan a name', status: 400 as const }
  const city = typeof input.city === 'string' && CITY_NAMES.includes(input.city) ? input.city : null
  const dateKey = planDateKey(input.planDate)
  const ids = Array.isArray(input.eventIds) ? input.eventIds.filter((id): id is string => typeof id === 'string').slice(0, 12) : []
  const events = ids.length ? await prisma.event.findMany({ where: { id: { in: ids } }, select: { id: true } }) : []
  const plan = await prisma.togetherPlan.create({
    data: {
      token: newPlanToken(),
      name,
      city,
      planDate: dateKey ? new Date(`${dateKey}T00:00:00.000Z`) : null,
      creatorId: who.userId,
      creatorGuest: who.userId ? null : who.guestKey,
      items: { create: events.map((e) => ({ eventId: e.id })) },
    },
    select: { id: true, token: true },
  })
  await touchMember(plan.id, who)
  return { token: plan.token }
}

export async function addEvents(token: string, who: Actor, eventIds: string[]) {
  const plan = await prisma.togetherPlan.findUnique({ where: { token }, select: { id: true, _count: { select: { items: true } } } })
  if (!plan) return { error: 'Plan not found', status: 404 as const }
  const room = Math.max(0, 30 - plan._count.items)
  const ids = [...new Set(eventIds)].slice(0, room)
  const events = ids.length ? await prisma.event.findMany({ where: { id: { in: ids } }, select: { id: true } }) : []
  if (events.length) {
    await prisma.togetherItem.createMany({ data: events.map((e) => ({ planId: plan.id, eventId: e.id })), skipDuplicates: true })
    await prisma.togetherPlan.update({ where: { id: plan.id }, data: { updatedAt: new Date() } })
  }
  await touchMember(plan.id, who)
  return { ok: true as const, added: events.length }
}

async function findPlan(token: string) {
  return prisma.togetherPlan.findUnique({
    where: { token },
    select: { id: true, city: true, creatorId: true, creatorGuest: true, _count: { select: { items: true } } },
  })
}

function isCreator(plan: { creatorId: string | null; creatorGuest: string | null }, who: Actor) {
  return (!!who.userId && plan.creatorId === who.userId) || (!!who.guestKey && plan.creatorGuest === who.guestKey)
}

export async function addPrivateStop(token: string, who: Actor, input: unknown) {
  const plan = await findPlan(token)
  if (!plan) return { error: 'Plan not found', status: 404 as const }
  if (plan._count.items >= 30) return { error: 'This plan is full', status: 400 as const }
  const clean = cleanPrivateStop((input ?? {}) as Record<string, unknown>)
  if ('error' in clean) return { error: clean.error, status: 400 as const }
  const geo = await locateAddress(clean.address, plan.city).catch(() => null)
  await prisma.togetherItem.create({
    data: {
      planId: plan.id,
      title: clean.title,
      address: clean.address,
      note: clean.note,
      startTime: clean.time,
      endTime: clean.endTime,
      stopDate: new Date(`${clean.date}T00:00:00.000Z`),
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
      addedById: who.userId,
      addedByGuest: who.userId ? null : who.guestKey,
    },
  })
  await prisma.togetherPlan.update({ where: { id: plan.id }, data: { updatedAt: new Date() } })
  await touchMember(plan.id, who)
  return { ok: true as const }
}

export async function updatePrivateStop(token: string, who: Actor, itemId: string, input: unknown) {
  const plan = await findPlan(token)
  if (!plan) return { error: 'Plan not found', status: 404 as const }
  const item = await prisma.togetherItem.findFirst({ where: { id: itemId, planId: plan.id, eventId: null }, select: { id: true, addedById: true, addedByGuest: true, address: true } })
  if (!item) return { error: 'That stop is not on the plan', status: 404 as const }
  if (!canChangePrivateStop(who, item, isCreator(plan, who))) return { error: 'Only the person who added this stop, or the plan creator, can change it', status: 403 as const }
  const clean = cleanPrivateStop((input ?? {}) as Record<string, unknown>)
  if ('error' in clean) return { error: clean.error, status: 400 as const }
  const moved = clean.address !== item.address
  const geo = moved ? await locateAddress(clean.address, plan.city).catch(() => null) : undefined
  await prisma.togetherItem.update({
    where: { id: item.id },
    data: {
      title: clean.title,
      address: clean.address,
      note: clean.note,
      startTime: clean.time,
      endTime: clean.endTime,
      stopDate: new Date(`${clean.date}T00:00:00.000Z`),
      ...(geo !== undefined ? { latitude: geo?.lat ?? null, longitude: geo?.lng ?? null } : {}),
    },
  })
  await prisma.togetherPlan.update({ where: { id: plan.id }, data: { updatedAt: new Date() } })
  return { ok: true as const }
}

export async function removePrivateStop(token: string, who: Actor, itemId: string) {
  const plan = await findPlan(token)
  if (!plan) return { error: 'Plan not found', status: 404 as const }
  const item = await prisma.togetherItem.findFirst({ where: { id: itemId, planId: plan.id, eventId: null }, select: { id: true, addedById: true, addedByGuest: true } })
  if (!item) return { error: 'That stop is not on the plan', status: 404 as const }
  if (!canChangePrivateStop(who, item, isCreator(plan, who))) return { error: 'Only the person who added this stop, or the plan creator, can remove it', status: 403 as const }
  await prisma.togetherItem.delete({ where: { id: item.id } })
  await prisma.togetherPlan.update({ where: { id: plan.id }, data: { updatedAt: new Date() } })
  return { ok: true as const }
}

export async function removeEvent(token: string, eventId: string) {
  const plan = await prisma.togetherPlan.findUnique({ where: { token }, select: { id: true } })
  if (!plan) return { error: 'Plan not found', status: 404 as const }
  await prisma.togetherItem.deleteMany({ where: { planId: plan.id, eventId } })
  await prisma.togetherPlan.update({ where: { id: plan.id }, data: { updatedAt: new Date() } })
  return { ok: true as const }
}

export async function castVote(token: string, who: Actor, itemId: string, name?: unknown) {
  const plan = await prisma.togetherPlan.findUnique({
    where: { token },
    select: { id: true, items: { select: { id: true } } },
  })
  if (!plan) return { error: 'Plan not found', status: 404 as const }
  if (!plan.items.some((item) => item.id === itemId)) return { error: 'That option is not on the plan', status: 400 as const }
  await touchMember(plan.id, who, typeof name === 'string' ? name : undefined)
  const current = await prisma.togetherVote.findFirst({
    where: who.userId ? { planId: plan.id, userId: who.userId } : { planId: plan.id, guestKey: who.guestKey },
    select: { id: true, itemId: true },
  })
  if (current?.itemId === itemId) await prisma.togetherVote.delete({ where: { id: current.id } })
  else if (current) await prisma.togetherVote.update({ where: { id: current.id }, data: { itemId } })
  else await prisma.togetherVote.create({ data: { planId: plan.id, itemId, userId: who.userId, guestKey: who.userId ? null : who.guestKey } })
  return { ok: true as const }
}
