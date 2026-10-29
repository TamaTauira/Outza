import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { WatchlistClient } from './watchlist-client'

export const metadata: Metadata = {
  title: 'My VibePeep',
  description: 'Saved events, venues and interests you follow, plus optional email reminders.',
  robots: { index: false, follow: false },
}

export default function WatchlistPage() {
  return (
    <PageShell>
      <WatchlistClient />
    </PageShell>
  )
}
