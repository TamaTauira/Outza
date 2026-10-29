import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { TogetherHome } from './together-home'

export const metadata: Metadata = {
  title: 'VibePeep Together',
  description: 'Shortlist events with friends and vote on the plan.',
  robots: { index: false, follow: false },
}

export default function TogetherPage() {
  return (
    <PageShell>
      <TogetherHome />
    </PageShell>
  )
}
