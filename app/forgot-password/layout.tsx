import type { Metadata } from 'next'

import { pageMeta } from '@/lib/page-meta'

export const metadata: Metadata = pageMeta({
  title: 'Reset your password',
  description: 'Ask for a link to choose a new VibePeep password.',
  path: '/forgot-password',
})

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
