import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { prisma } from '@/lib/db'
import { siteUrl } from '@/lib/site-url'
import { eventPath } from '@/lib/seo'
import { redactCommunityPublic, sectionByKey } from '@/lib/community-shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Printable poster | VibePeep', robots: { index: false, follow: false } }

export default async function CommunityPosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ev = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true, title: true, description: true, date: true, time: true, endTime: true, suburb: true, city: true,
      venueName: true, venueAddress: true, communityKey: true, locationVisibility: true, approvalState: true,
      deletedAt: true, status: true, isFree: true, price: true, organiserName: true, childrenInImage: true, imageKidSafe: true, imageUrl: true,
    },
  }).catch(() => null)
  if (!ev?.communityKey || ev.deletedAt || ev.approvalState !== 'APPROVED') notFound()
  const safe = redactCommunityPublic(ev)
  const section = sectionByKey(ev.communityKey)
  const url = `${siteUrl()}${eventPath(ev)}`
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
  const when = ev.date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const where = [safe.venueName, safe.suburb, safe.city].filter((part, i, all) => part && all.indexOf(part) === i).join(', ')
  return (
    <main className="mx-auto max-w-xl bg-white px-6 py-8 text-neutral-900 print:max-w-none">
      <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">VibePeep · {section?.label}</p>
      <h1 className="mt-3 font-display text-4xl font-bold leading-tight">{ev.title}</h1>
      {ev.status === 'CANCELLED' && <p className="mt-2 text-lg font-semibold">Cancelled</p>}
      {ev.status === 'POSTPONED' && <p className="mt-2 text-lg font-semibold">Postponed</p>}
      <p className="mt-4 text-lg">{when}{ev.time ? ` · ${ev.time}${ev.endTime ? `–${ev.endTime}` : ''}` : ''}</p>
      <p className="text-lg">{where}</p>
      <p className="mt-2 text-lg font-semibold">{ev.isFree ? 'Free' : (ev.price || 'See the listing')}</p>
      {safe.description && <p className="mt-4 text-base leading-relaxed">{safe.description}</p>}
      {ev.organiserName && <p className="mt-4 text-sm">Run by {ev.organiserName}</p>}
      <div className="mt-8 flex items-end justify-between gap-6">
        <div>
          <p className="text-sm font-semibold">More info</p>
          <p className="break-all text-sm">{url}</p>
        </div>
        <div className="h-36 w-36 shrink-0" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <p className="mt-8 text-xs text-neutral-500">Details can change. Confirm with the organiser before you go. VibePeep doesn’t sell tickets for this listing.</p>
      <style>{`@media print { a, button { display: none } }`}</style>
    </main>
  )
}
