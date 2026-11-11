import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { WatchlistClient } from './watchlist-client'

export const metadata: Metadata = {
  title: 'My VibePeep',
  description: 'Saves, follows, and the occasional email nudge. Your keepers in one place.',
  robots: { index: false, follow: false },
}

export default function WatchlistPage() {
  return (
    <PageShell>
      <WatchlistClient />
    </PageShell>
  )
}
