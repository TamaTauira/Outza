import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LocalClient } from './local-client'

export const metadata: Metadata = {
  title: 'VibePeep Local — garage sales, markets, fetes and neighbourhood events',
  description: 'Garage sales, markets, fetes and the neighbourhood stuff worth leaving the house for. List yours free on VibePeep Local.',
  alternates: { canonical: '/local' },
}

export default function LocalPage() {
  return <Suspense fallback={null}><LocalClient /></Suspense>
}
