import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { COMMUNITY_SECTIONS, communitySectionPath } from '@/lib/community-shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Community hub | VibePeep',
  description: 'Garage sales, school fetes, farmers markets, pop-ups, community sport, charity events, dog meetups and local art. List yours free.',
}

async function counts() {
  try {
    const grouped = await prisma.event.groupBy({
      by: ['communityKey'],
      where: { communityKey: { not: null }, approvalState: 'APPROVED', deletedAt: null },
      _count: { _all: true },
    })
    return Object.fromEntries(grouped.map((row) => [row.communityKey, row._count._all]))
  } catch {
    return {} as Record<string, number>
  }
}

export default async function CommunityHub() {
  const tally = await counts()
  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={0} />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">The neighbourhood, without the runaround</h1>
        <p className="mt-3 text-base text-muted-foreground">Garage sales, fetes, markets, pop-ups, park sport, charity dos, dog walks and local art. If it doesn’t have a ticketing empire, it can still have a page.</p>
        <p className="mt-4">
          <Link href="/community/submit" className="inline-flex h-12 items-center rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground">List something free</Link>
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {COMMUNITY_SECTIONS.map((section) => {
            const n = tally[section.key] ?? 0
            return (
              <li key={section.key}>
                <Link href={communitySectionPath(section.key)} className="block h-full rounded-2xl bg-card p-4 shadow-sm hover:bg-muted/40">
                  <span className="font-display text-lg font-bold">{section.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{section.blurb}</span>
                  <span className="mt-3 block text-xs font-semibold text-muted-foreground">{n === 0 ? 'Be the first listing' : `${n} live ${n === 1 ? 'listing' : 'listings'}`}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        <p className="mt-8 text-sm text-muted-foreground">VibePeep Local still covers warehouse clearances and the longer sale form. This hub is the fast lane for neighbourhood stuff.</p>
      </main>
      <Footer lastRefresh={null} />
    </div>
  )
}
