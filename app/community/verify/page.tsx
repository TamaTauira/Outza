import type { Metadata } from 'next'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { CommunityVerifyClient } from './verify-client'

export const metadata: Metadata = { title: 'Confirm your listing | VibePeep', robots: { index: false, follow: false } }

export default function CommunityVerifyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={0} />
      <CommunityVerifyClient />
      <Footer lastRefresh={null} />
    </div>
  )
}
