import type { Metadata } from 'next'

export const revalidate = 600

export const metadata: Metadata = { title: 'Map', alternates: { canonical: '/map' } }

export default function MapPage() {
  return null
}
