'use client'

import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { useSaved } from '@/lib/saved'

/** Navbar + footer wrapper for server-rendered content pages (city landing pages etc.). */
export function PageShell({ children }: { children: React.ReactNode }) {
  const { saved } = useSaved()
  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={saved.length} />
      {children}
      <Footer lastRefresh={null} />
    </div>
  )
}
