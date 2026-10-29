import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { ensureGuestKey, readGuestKey } from '@/lib/guest'
import { cleanDisplayName, cleanPlanName, newPlanToken, planDateKey } from '@/lib/together'
import { CITY_NAMES } from '@/lib/cities'

const eventSelect = {
  id: true, title: true, date: true, endDate: true, time: true, endTime: true, venueName: true, suburb: true,
  city: true, category: true, isFree: true, price: true, ticketUrl: true, imageUrl: true,
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

function planPayload(plan: {
  token: string
  name: string
  city: string | null
  planDate: Date | null
  creatorId: string | null
  items: { id: string; event: { id: string; title: string; date: Date; endDate: Date | null; time: string | null; endTime: string | null; venueName: string; suburb: string | null; city: string; category: string; isFree: boolean; price: string | null; ticketUrl: string | null; imageUrl: string | null } }[]
  votes: { itemId: string; userId: string | null; guestKey: string | null }[]
  members: { name: string; userId: string | null; guestKey: string | null }[]
}, who: Actor) {
  const mine = (row: { userId: string | null; guestKey: string | null }) =>
    (!!who.userId && row.userId === who.userId) || (!!who.guestKey && row.guestKey === who.guestKey)
  const counts = new Map<string, number>()
  for (const vote of plan.votes) counts.set(vote.itemId, (counts.get(vote.itemId) ?? 0) + 1)
  const myVote = plan.votes.find(mine)?.itemId ?? null
  return {
    token: plan.token,
    name: plan.name,
    city: plan.city,
    planDate: plan.planDate ? plan.planDate.toISOString().slice(0, 10) : null,
    isCreator: (!!who.userId && plan.creatorId === who.userId) || false,
    me: plan.members.find(mine)?.name ?? who.name,
    members: plan.members.map((m) => m.name),
    myVote,
    items: plan.items.map((item) => ({
      id: item.id,
      votes: counts.get(item.id) ?? 0,
      mine: myVote === item.id,
      event: { ...item.event, date: item.event.date.toISOString(), endDate: item.event.endDate?.toISOString() ?? null },
    })),
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
  const payload = planPayload(fresh, who)
  payload.isCreator = (!!who.userId && fresh.creatorId === who.userId) || (!!who.guestKey && fresh.creatorGuest === who.guestKey)
  return payload
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
