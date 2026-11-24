import Link from 'next/link'
import { verify } from '@/lib/newsletter/links'
import { VibePeepLogo } from '@/components/vibepeep-logo'
import { VenueUnsubscribeClient } from './client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Unsubscribe from venue notes — VibePeep', robots: { index: false } }

export default async function VenueUnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { u = '', k = '' } = await searchParams
  const valid = !!u && verify(k, u, 'venue-report-unsub')
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center shadow-lg">
        <Link href="/" aria-label="VibePeep home" className="inline-flex"><VibePeepLogo size="md" /></Link>
        {valid ? <VenueUnsubscribeClient u={u} k={k} /> : (
          <>
            <h1 className="mt-4 font-display text-h1">Link not recognised</h1>
            <p className="mt-2 text-sm text-muted-foreground">This unsubscribe link is invalid. You can turn the monthly note off any time in the venue dashboard.</p>
          </>
        )}
      </div>
    </main>
  )
}
