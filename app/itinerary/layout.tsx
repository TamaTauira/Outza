import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Make a day of it', robots: { index: false, follow: true } }

export default function ItineraryLayout({ children }: { children: React.ReactNode }) {
  return children
}
