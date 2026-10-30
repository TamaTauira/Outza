import type { Metadata } from 'next'
import Link from 'next/link'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { getSessionUser } from '@/lib/session'
import { CommunitySubmitForm } from './submit-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'List a community event free | VibePeep',
  description: 'Add a garage sale, fete, market, pop-up, community sport fixture, charity event, dog meetup or local art show. Free, and built for a phone.',
}

export default async function CommunitySubmitPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const me = await getSessionUser().catch(() => null)
  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={0} />
      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        <p className="text-sm"><Link href="/community" className="text-muted-foreground hover:text-foreground">Community hub</Link></p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">List it before the kettle boils</h1>
        <p className="mt-2 text-base text-muted-foreground">Title, time, suburb, a sentence, and an email we can send a code to. A photo is optional. Your email stays off the public page.</p>
        <CommunitySubmitForm category={one(sp.category)} preset={one(sp.preset)} email={me?.email ?? ''} />
      </main>
      <Footer lastRefresh={null} />
    </div>
  )
}
