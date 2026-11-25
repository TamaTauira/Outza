import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { TogetherHome } from './together-home'

import { pageMeta } from '@/lib/page-meta'

export const metadata: Metadata = pageMeta({
  title: 'Together',
  description: 'Shortlist gigs with mates, share one link, and vote on the night.',
  path: '/together',
  index: false,
})

export default function TogetherPage() {
  return (
    <PageShell>
      <TogetherHome />
    </PageShell>
  )
}
