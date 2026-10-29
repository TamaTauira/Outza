import Link from 'next/link'
import { VibePeepLogo } from '@/components/vibepeep-logo'

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-md">
        <Link href="/" className="flex justify-center mb-8" aria-label="VibePeep home">
          <VibePeepLogo size="md" />
        </Link>
        <div className="rounded-2xl bg-card text-card-foreground shadow-xl border border-border/60 p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-6">{subtitle}</p>
          {children}
        </div>
        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          We acknowledge the Traditional Custodians of the lands across Australia and pay our respects to Elders past and present.
        </p>
      </div>
    </main>
  )
}
