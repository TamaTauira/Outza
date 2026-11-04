import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { TogetherHome } from './together-home'

export const metadata: Metadata = {
  title: 'VibePeep Together',
  description: 'VibePeep Together: shortlist events with friends and vote on the night.',
  robots: { index: false, follow: false },
}

export default function TogetherPage() {
  return (
    <PageShell>
      <TogetherHome />
    </PageShell>
  )
}
