import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LocalClient } from './local-client'

import { pageMeta } from '@/lib/page-meta'

export const metadata: Metadata = pageMeta({
  title: 'Local',
  description: 'From weekend markets to neighbourhood garage sales, take a peep at what’s happening near you. List yours free on VibePeep Local.',
  path: '/local',
})

export default function LocalPage() {
  return <Suspense fallback={null}><LocalClient /></Suspense>
}
