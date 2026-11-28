import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { boardDisplayName } from '@/lib/cities'
import { sydneyToday } from '@/lib/event-store'
import { eventPath } from '@/lib/seo'
import { SiteHeader } from '@/components/site-header'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { ClaimedTick } from '@/components/ClaimedTick'
import { organiserNameClaimed } from '@/lib/event-overrides'
import { isPublicPromoterProfile, publicListingFilter } from '@/lib/public-promoter'
import { boardClockLine } from '@/lib/listing-window'
import { openGraphImage } from '@/lib/share-image'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
const user = await prisma.user.findUnique({ where: { id }, select: { orgName: true, name: true, email: true, role: true, image: true } })
  const published = user ? await prisma.event.count({ where: { promoterId: id, ...publicListingFilter() } }) : 0
  if (!user || user.role !== 'PROMOTER' || !isPublicPromoterProfile({ orgName: user.orgName, name: user.name, email: user.email, publishedListings: published })) {
    return { title: 'Organiser not found', robots: { index: false }, openGraph: { title: 'Organiser not found · VibePeep' } }
  }
  const name = user.orgName!.trim()
  const title = name
  const description = `Events presented by ${name} on VibePeep.`
  const url = `/organisers/${id}`
  const image = openGraphImage(user.image, `${name} on VibePeep`)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} · VibePeep`, description, url, type: 'profile', images: [image] },
    twitter: { card: 'summary_large_image', title: `${title} · VibePeep`, description, images: [image] },
  }
}

export default async function OrganiserPage({ params }: Props) {
  const { id } = await params
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, orgName: true, email: true, bio: true, website: true, image: true, homeCity: true, role: true },
  })
  const published = user ? await prisma.event.count({ where: { promoterId: id, ...publicListingFilter() } }) : 0
  if (!user || user.role !== 'PROMOTER' || !isPublicPromoterProfile({ orgName: user.orgName, name: user.name, email: user.email, publishedListings: published })) notFound()
  const name = user.orgName!.trim()
  const claimed = await organiserNameClaimed(user.id)
  const events = await prisma.event.findMany({
    where: { promoterId: user.id, date: { gte: sydneyToday() }, duplicateOfId: null, hidden: false, NOT: { status: 'CANCELLED', statusSource: 'promoter' } },
    orderBy: { date: 'asc' },
    take: 24,
    select: { id: true, title: true, date: true, endDate: true, time: true, endTime: true, venueName: true, city: true, category: true },
  })
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="vp-wrap vp-page-top px-4 pb-8 sm:px-6 lg:pb-10">
        <BackToEventsLink className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to events</BackToEventsLink>
        <div className="mt-6 flex items-start gap-4">
          {user.image && <img src={user.image} alt="" className="w-16 h-16 rounded-full object-cover bg-muted" />}
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Organiser</p>
            <h1 className="font-display text-h1 flex items-center gap-2 flex-wrap">
              {name}
              {claimed && <ClaimedTick kind="organiser" className="h-5 w-5" />}
            </h1>
            {user.homeCity && <p className="text-sm text-muted-foreground mt-1">{boardDisplayName(user.homeCity)}</p>}
          </div>
        </div>
        {user.bio && <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap">{user.bio}</p>}
        {user.website && <a href={user.website} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">Website <ExternalLink className="w-3.5 h-3.5" /></a>}
        <h2 className="mt-8 font-semibold">Upcoming events</h2>
        {!events.length ? <p className="mt-2 text-sm text-muted-foreground">Nothing upcoming on VibePeep right now.</p> : (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {events.map((e) => {
              const clock = boardClockLine(e)
              return (
              <li key={e.id} className="rounded-xl border border-border bg-card px-4 py-3">
                <Link href={eventPath(e)} className="font-medium hover:text-primary">{e.title}</Link>
                <p className="text-xs text-muted-foreground">{e.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}{clock ? ` · ${clock}` : ''} · {e.venueName} · {e.city}</p>
              </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
