import type { Metadata } from 'next'
import { Navbar } from '@/components/navbar'
import { CommunityVerifyClient } from './verify-client'

export const metadata: Metadata = { title: 'Confirm your listing', robots: { index: false, follow: false }, openGraph: { title: 'Confirm your listing · VibePeep' } }

export default function CommunityVerifyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={0} />
      <CommunityVerifyClient />
    </div>
  )
}
