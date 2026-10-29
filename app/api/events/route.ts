export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { friendsGoing } from '@/lib/social'
import { getSessionUser } from '@/lib/session'
import { boardArgsFromSearch, getBoardFeed } from '@/lib/board-feed'
import { hasSessionCookie, PRIVATE_NO_STORE, publicCacheHeaders } from '@/lib/http-cache'

export async function GET(request: NextRequest) {
  try {
    const args = boardArgsFromSearch(request.nextUrl.searchParams)
    const signedIn = hasSessionCookie(request.cookies.getAll())
    const board = await getBoardFeed(args)
    const me = signedIn ? await getSessionUser().catch(() => null) : null
    const ids = board.events.map((e) => e.id)
    const [friends, mine] = await Promise.all([
      me && ids.length ? friendsGoing(me.id, ids) : Promise.resolve({} as Record<string, string[]>),
      me && ids.length ? prisma.attendance.findMany({ where: { userId: me.id, eventId: { in: ids } }, select: { eventId: true } }) : Promise.resolve([]),
    ])
    const going = new Set(mine.map((m) => m.eventId))
    const body = {
      events: board.events.map((e) => ({ ...e, friendsGoing: friends[e.id] ?? [], going: going.has(e.id) })),
      total: board.total,
      page: args.page,
      totalPages: Math.max(1, Math.ceil(board.total / args.limit)),
    }
    return NextResponse.json(body, { headers: me ? PRIVATE_NO_STORE : publicCacheHeaders(60) })
  } catch (err: any) {
    console.error('Error fetching events:', err?.message)
    return NextResponse.json({ events: [], total: 0, page: 1, totalPages: 0 }, { status: 500 })
  }
}
