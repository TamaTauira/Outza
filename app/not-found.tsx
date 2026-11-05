import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { VibePeepMascot } from '@/components/vibepeep-mascot'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <PageShell>
      <main className="vp-wrap flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center lg:grid lg:grid-cols-2 lg:items-center lg:gap-12 lg:text-left">
        <div className="flex flex-col items-center lg:items-start">
          <VibePeepMascot className="w-40 sm:w-48" priority alt="VibePeep the robot, looking around and waving" />
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">I peeked everywhere.</h1>
          <p className="mt-2 text-base text-muted-foreground">This page isn&apos;t on. Not tonight, not in any city.</p>
          <Button asChild className="mt-6"><Link href="/">Back to what&apos;s on</Link></Button>
        </div>
        <nav aria-label="Popular pages" className="mt-10 hidden w-full lg:mt-0 lg:block">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Keep looking</p>
          <ul className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {[
              ['/', 'Board'],
              ['/map', 'Map'],
              ['/local', 'Local'],
              ['/itinerary', 'Itinerary'],
              ['/saved', 'Saved'],
              ['/sydney/events', 'Sydney events'],
            ].map(([href, label]) => (
              <li key={href}><Link href={href} className="block rounded-xl border border-border bg-card px-4 py-3 font-semibold hover:bg-muted">{label}</Link></li>
            ))}
          </ul>
        </nav>
      </main>
    </PageShell>
  )
}
