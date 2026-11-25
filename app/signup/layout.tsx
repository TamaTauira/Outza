import type { Metadata } from 'next'

import { pageMeta } from '@/lib/page-meta'

export const metadata: Metadata = pageMeta({
  title: 'Create an account',
  description: 'Make a VibePeep account to save events and keep a plan.',
  path: '/signup',
})

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
