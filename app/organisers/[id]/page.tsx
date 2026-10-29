import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { sydneyToday } from '@/lib/event-store'
import { eventPath } from '@/lib/seo'
import { Footer } from '@/components/footer'
import { BackToEventsLink } from '@/components/back-to-events-link'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const user = await prisma.user.findUnique({ where: { id }, select: { orgName: true, name: true, role: true } })
  if (!user || (user.role !== 'PROMOTER' && user.role !== 'ADMIN')) return { title: 'Organiser not found | VibePeep', robots: { index: false } }
  const name = user.orgName || user.name || 'Organiser'
  return { title: `${name} | VibePeep`, description: `Events presented by ${name} on VibePeep.` }
}

export default async function OrganiserPage({ params }: Props) {
  const { id } = await params
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, orgName: true, bio: true, website: true, image: true, homeCity: true, role: true },
  })
  if (!user || (user.role !== 'PROMOTER' && user.role !== 'ADMIN')) notFound()
  const name = user.orgName || user.name || 'Organiser'
  const events = await prisma.event.findMany({
    where: { promoterId: user.id, date: { gte: sydneyToday() }, duplicateOfId: null, NOT: { status: 'CANCELLED', statusSource: 'promoter' } },
    orderBy: { date: 'asc' },
    take: 24,
    select: { id: true, title: true, date: true, time: true, venueName: true, city: true, category: true },
  })
  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <BackToEventsLink className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to events</BackToEventsLink>
        <div className="mt-6 flex items-start gap-4">
          {user.image && <img src={user.image} alt="" className="w-16 h-16 rounded-full object-cover bg-muted" />}
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">Organiser</p>
            <h1 className="font-display text-3xl font-bold tracking-tight">{name}</h1>
            {user.homeCity && <p className="text-sm text-muted-foreground mt-1">{user.homeCity}</p>}
          </div>
        </div>
        {user.bio && <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap">{user.bio}</p>}
        {user.website && <a href={user.website} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">Website <ExternalLink className="w-3.5 h-3.5" /></a>}
        <h2 className="mt-8 font-semibold">Upcoming events</h2>
        {!events.length ? <p className="mt-2 text-sm text-muted-foreground">Nothing upcoming on VibePeep right now.</p> : (
          <ul className="mt-3 divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="py-3">
                <Link href={eventPath(e)} className="font-medium hover:text-primary">{e.title}</Link>
                <p className="text-xs text-muted-foreground">{e.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}{e.time ? ` · ${e.time}` : ''} · {e.venueName} · {e.city}</p>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer lastRefresh={null} />
    </div>
  )
}
