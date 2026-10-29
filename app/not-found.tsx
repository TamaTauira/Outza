import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { VibePeepMascot } from '@/components/vibepeep-mascot'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <PageShell>
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
        <VibePeepMascot className="w-40 sm:w-48" priority alt="VibePeep the robot, looking around and waving" />
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">I peeked everywhere.</h1>
        <p className="mt-2 text-base text-muted-foreground">This page isn&apos;t on. Not tonight, not in any city.</p>
        <Button asChild className="mt-6"><Link href="/">Back to what&apos;s on</Link></Button>
      </main>
    </PageShell>
  )
}
