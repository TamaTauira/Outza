import type { Metadata } from 'next'

import { pageMeta } from '@/lib/page-meta'

export const metadata: Metadata = pageMeta({
  title: 'Sign in',
  description: 'Sign in to save events, keep an itinerary and manage a promoter or venue account.',
  path: '/login',
})

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
