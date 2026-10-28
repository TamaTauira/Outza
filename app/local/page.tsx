import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LocalClient } from './local-client'

export const metadata: Metadata = {
  title: 'OUTZA Local — garage sales, clearance sales, markets & community events near you',
  description: 'Everything happening nearby: garage and moving sales, warehouse clearances, markets and pop-ups, fundraisers and community activities. List yours free, including weekly and monthly events.',
  alternates: { canonical: '/local' },
}

export default function LocalPage() {
  return <Suspense fallback={null}><LocalClient /></Suspense>
}
