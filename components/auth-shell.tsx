'use client'

import Link from 'next/link'
import { Navbar } from '@/components/navbar'
import { OutzaLogo } from '@/components/outza-logo'
import { useSaved } from '@/lib/saved'

function AuthNav() {
  const { saved } = useSaved()
  return <Navbar savedCount={saved.length} />
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AuthNav />
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link href="/" className="flex justify-center mb-8" aria-label="Outza home">
            <OutzaLogo size="md" />
          </Link>
          <div className="rounded-2xl bg-card text-card-foreground shadow-xl border border-border/60 p-6 sm:p-8">
            <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
            <p className="text-base sm:text-sm text-muted-foreground mt-1 mb-6">{subtitle}</p>
            {children}
          </div>
          <p className="mt-6 text-center text-sm leading-relaxed text-muted-foreground">
            We acknowledge the Traditional Custodians of the lands across Australia and pay our respects to Elders past and present.
          </p>
        </div>
      </main>
    </div>
  )
}
