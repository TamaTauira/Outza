import type { Metadata } from 'next'

import { pageMeta } from '@/lib/page-meta'

export const metadata: Metadata = {
  ...pageMeta({ title: 'The keepers', path: '/saved', index: false }),
  robots: { index: false, follow: true },
}

export default function SavedPage() {
  return null
}
