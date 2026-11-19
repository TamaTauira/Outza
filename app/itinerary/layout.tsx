import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Itinerary · VibePeep',
  description: 'Line up the stops for a night out. The plan stays on this device.',
}

export default function ItineraryLayout({ children }: { children: React.ReactNode }) {
  return children
}
