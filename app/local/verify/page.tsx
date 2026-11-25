import type { Metadata } from 'next'
import { Navbar } from '@/components/navbar'
import { pageMeta } from '@/lib/page-meta'
import { CommunityVerifyClient } from './verify-client'

export const metadata: Metadata = pageMeta({
  title: 'Confirm your listing',
  path: '/local/verify',
  index: false,
})

export default function CommunityVerifyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={0} />
      <CommunityVerifyClient />
    </div>
  )
}
