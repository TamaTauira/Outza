import { NextResponse } from 'next/server'
import { queueLocalImage } from '@/lib/images/runner'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { CITIES, cityDef } from '@/lib/cities'
import { notifyTrustTeam } from '@/lib/trust'
import { storagePath } from '@/lib/s3'
import { addDaysStr, occurrences, recurrenceLabel, todayIn, localCategoryLabel, localDupKey, LOCAL_FLAG_LABEL, localPath } from '@/lib/local-shared'
import { filterCommunityListings, redactCommunityPublic } from '@/lib/community-shared'
import { eventPath } from '@/lib/seo'
import { dedupeFeed, filterFeed, sectionCounts, sectionForLocal, type FeedItem } from '@/lib/local-feed'
import { aiModeration, expiryFor, findDuplicate, hardBlock, ipHash, parseLocal, recentCount, spamSignals, validateAddress } from '@/lib/local'

export const dynamic = 'force-dynamic'

const PUBLIC = { id: true, title: true, category: true, description: true, address: true, suburb: true, postcode: true, city: true, lat: true, lng: true, startDate: true, endDate: true, startTime: true, endTime: true, recurrence: true, recurUntil: true, priceNote: true, organiserName: true, websiteUrl: true, userId: true, sourceName: true } as const

function range(tz: string, when: string) {
  const from = todayIn(tz)
  const dow = new Date(`${from}T00:00:00Z`).getUTCDay()
  if (when === 'weekend') {
    const start = dow === 0 || dow === 6 ? from : addDaysStr(from, 6 - dow)
    return { from: start, to: dow === 0 ? from : addDaysStr(start, 1) }
  }
  if (when === 'today') return { from, to: from }
  return { from, to: addDaysStr(from, when === '7' ? 6 : 29) }
}

/** GET ?city=&category=&when=today|weekend|7|30 · ?mine=1 for the signed-in user's own listings */
export async function GET(req: Request) {
  const u = new URL(req.url)
  if (u.searchParams.get('mine') === '1') {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please sign in' }, { status: 401 })
    const mine = await prisma.localListing.findMany({ where: { userId: me.id, status: { not: 'REMOVED' } }, orderBy: { createdAt: 'desc' }, take: 50, select: { ...PUBLIC, status: true, expiresAt: true, flags: true, reviewNote: true } })
    const email = me.email.toLowerCase()
    const community = email ? await prisma.event.findMany({
      where: { communityKey: { not: null }, deletedAt: null, OR: [{ promoterId: me.id }, { contactEmail: email }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, title: true, suburb: true, city: true, communityKey: true, approvalState: true, status: true, date: true },
    }).catch(() => []) : []
    return NextResponse.json({
      listings: mine.map((l) => ({ ...l, schedule: recurrenceLabel(l) })),
      community: community.map((ev) => ({ ...ev, date: ev.date.toISOString(), href: eventPath(ev) })),
    })
  }
  const city = u.searchParams.get('city') ?? ''
  const section = u.searchParams.get('category') ?? ''
  const suburb = u.searchParams.get('suburb') ?? ''
  const when = u.searchParams.get('when') ?? '30'
  const validCity = CITIES.some((c) => c.name === city)
  const zone = cityDef(validCity ? city : 'Sydney')
  const { from, to } = range(zone.tz, when)
  try {
  const rows = await prisma.localListing.findMany({
    where: { status: 'APPROVED', duplicateOfId: null, expiresAt: { gte: new Date() }, ...(validCity ? { city } : {}) },
    select: PUBLIC, take: 600,
  })
  const seen = new Set<string>()
  const localItems: FeedItem[] = rows.flatMap((l) => occurrences(l, from, to).map((date) => ({ l, date })))
    .filter(({ l, date }) => { const k = `${localDupKey(l)}|${date}|${l.startTime}`; if (seen.has(k)) return false; seen.add(k); return true })
    .map(({ l, date }) => ({
      id: l.id,
      title: l.title,
      section: sectionForLocal(l),
      suburb: l.suburb,
      city: l.city,
      date,
      time: l.startTime,
      isFree: !l.priceNote || /^free\b/i.test(l.priceNote.trim()),
      price: l.priceNote,
      href: localPath(l, date),
      kind: 'local' as const,
    }))
  const events = await prisma.event.findMany({
    where: { communityKey: { not: null }, approvalState: 'APPROVED', deletedAt: null, duplicateOfId: null, ...(validCity ? { city } : {}) },
    select: {
      id: true, title: true, description: true, date: true, endDate: true, time: true, suburb: true, city: true,
      venueName: true, venueAddress: true, isFree: true, price: true, status: true, recurrence: true, communityKey: true,
      locationVisibility: true, childrenInImage: true, imageKidSafe: true,
    },
    take: 400,
  }).catch(() => [])
  const shaped = events.map((ev) => ({
    ...redactCommunityPublic(ev),
    id: ev.id,
    communityKey: ev.communityKey || '',
    date: ev.date.toISOString().slice(0, 10),
    endDate: ev.endDate ? ev.endDate.toISOString().slice(0, 10) : null,
    recurrence: ev.recurrence,
    time: ev.time,
    isFree: ev.isFree,
    status: ev.status,
  }))
  const communityItems: FeedItem[] = filterCommunityListings(shaped, { city: validCity ? city : null, from, to }, zone).map((ev) => ({
    id: ev.id,
    title: ev.title,
    section: ev.communityKey,
    suburb: ev.suburb || '',
    city: ev.city,
    date: ev.occursOn,
    time: ev.time,
    isFree: ev.isFree,
    price: ev.price,
    href: eventPath(ev),
    kind: 'community' as const,
    status: ev.status,
  }))
  const items = filterFeed(dedupeFeed([...communityItems, ...localItems]), { section, suburb }).slice(0, 300)
  return NextResponse.json({ from, to, items, counts: sectionCounts(filterFeed(dedupeFeed([...communityItems, ...localItems]), { suburb })) })
  } catch (err) {
    console.error('Local listings failed:', err)
    return NextResponse.json({ from, to, items: [], counts: {}, notice: 'Listings are unavailable right now.' })
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}))
    // Honeypot: real people never fill this hidden field. Pretend success so bots learn nothing.
    if (typeof b.company === 'string' && b.company.trim()) return NextResponse.json({ ok: true, status: 'PENDING', notes: [] })
    const parsed = parseLocal(b)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const i = parsed.input
    // Optional image: must be one our upload route produced, and the lister must confirm they may use it.
    let imagePath: string | null = null
    if (typeof b.imagePath === 'string' && b.imagePath) {
      if (!b.imagePath.startsWith(storagePath('local-images/')) || !/^[\w\-/]+\.webp$/.test(b.imagePath)) return NextResponse.json({ error: 'That image upload isn’t valid. Please upload it again.' }, { status: 400 })
      if (b.imageRights !== true) return NextResponse.json({ error: 'Please confirm you own the image or have permission to use it.' }, { status: 400 })
      imagePath = b.imagePath
    }
    const blocked = hardBlock(i)
    if (blocked) return NextResponse.json({ error: blocked }, { status: 400 })

    const me = await getSessionUser().catch(() => null)
    const hash = ipHash(req)
    if ((await recentCount(hash, i.contactEmail)) >= 5) return NextResponse.json({ error: 'You’ve added a lot of listings today. Please try again tomorrow, or contact us if you run a market or venue.' }, { status: 429 })

    const filledMs = typeof b.startedAt === 'number' ? Date.now() - b.startedAt : null
    const [addr, dupe, mod] = await Promise.all([validateAddress(i), findDuplicate(i), aiModeration(i)])
    const flags: string[] = []
    if (!me) flags.push('ANONYMOUS')
    if (spamSignals(i, filledMs).length) flags.push('SPAM_SIGNALS')
    if (!addr.verified) flags.push('ADDRESS_UNVERIFIED')
    if (addr.outside) flags.push('OUTSIDE_CITY')
    if (dupe) flags.push('POSSIBLE_DUPLICATE')
    if (mod) flags.push('MODERATION')
    const status = flags.length ? 'PENDING' : 'APPROVED'

    const row = await prisma.localListing.create({
      data: {
        ...i, imagePath, userId: me?.id ?? null, lat: addr.lat, lng: addr.lng, addressVerified: addr.verified, status, flags,
        duplicateOfId: dupe?.kind === 'local' ? dupe.id : null, ipHash: hash, expiresAt: expiryFor(i),
        reviewNote: [mod ? `AI: ${mod}` : '', dupe ? `Similar to ${dupe.kind === 'event' ? 'board event' : 'listing'} “${dupe.title}” (${dupe.id})` : ''].filter(Boolean).join(' · ') || null,
      },
      select: { id: true },
    })
    if (imagePath) queueLocalImage(row.id)
    if (status === 'PENDING') {
      await notifyTrustTeam(`VibePeep Local listing to review: ${i.title.slice(0, 60)}`, [
        ['Listing', `${i.title} (${localCategoryLabel(i.category)}, ${i.suburb} ${i.city})`], ['When', `${i.startDate} ${i.startTime}–${i.endTime} · ${recurrenceLabel(i)}`],
        ['Flags', flags.map((f) => LOCAL_FLAG_LABEL[f] ?? f).join(', ')], ['Organiser', `${i.organiserName} <${i.contactEmail}>`], ['Review', '/admin/local'],
      ])
    }
    const notes = flags.filter((f) => f !== 'SPAM_SIGNALS' && f !== 'MODERATION').map((f) => LOCAL_FLAG_LABEL[f])
    return NextResponse.json({ ok: true, id: row.id, status, notes, duplicateOf: dupe?.title ?? null })
  } catch (err: any) {
    console.error('Local listing submit failed:', err?.message)
    return NextResponse.json({ error: 'Could not save your listing. Please try again.' }, { status: 500 })
  }
}
