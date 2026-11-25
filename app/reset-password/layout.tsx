import type { Metadata } from 'next'

import { pageMeta } from '@/lib/page-meta'

export const metadata: Metadata = pageMeta({
  title: 'Choose a new password',
  path: '/reset-password',
  index: false,
})

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
