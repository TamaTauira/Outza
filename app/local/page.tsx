import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LocalClient } from './local-client'

export const metadata: Metadata = {
  title: 'VibePeep Local — garage sales, markets, fetes and neighbourhood events',
  description: 'Garage sales, clearances, farmers markets, pop-ups, school fundraisers, community sport, charity events, dog meetups and local art. List yours free.',
  alternates: { canonical: '/local' },
}

export default function LocalPage() {
  return <Suspense fallback={null}><LocalClient /></Suspense>
}
