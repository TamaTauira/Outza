import type { Metadata } from 'next'

export const revalidate = 600

import { pageMeta } from '@/lib/page-meta'

export const metadata: Metadata = pageMeta({
  title: "The Map: what's on near you",
  description: "What's on near you, on a map.",
  path: '/map',
})

export default function MapPage() {
  return null
}
