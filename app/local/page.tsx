import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LocalClient } from './local-client'

export const metadata: Metadata = {
  title: 'VibePeep Local — good things around the corner',
  description: 'From weekend markets to neighbourhood garage sales, take a peep at what’s happening near you. List yours free on VibePeep Local.',
  alternates: { canonical: '/local' },
}

export default function LocalPage() {
  return <Suspense fallback={null}><LocalClient /></Suspense>
}
