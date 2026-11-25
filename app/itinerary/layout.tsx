import type { Metadata } from 'next'

import { pageMeta } from '@/lib/page-meta'

export const metadata: Metadata = pageMeta({
  title: 'Itinerary',
  description: 'Line up the stops for a night out. The plan stays on this device.',
  path: '/itinerary',
})

export default function ItineraryLayout({ children }: { children: React.ReactNode }) {
  return children
}
