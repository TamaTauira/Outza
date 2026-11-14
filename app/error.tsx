'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { reportCrash } from '@/components/report-crash'
import { claimNetworkRetry, isBareNetworkFault } from '@/lib/network-fault'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const network = isBareNetworkFault(error)
  // reportCrash reloads once for a chunk-load failure and skips the fault email until that reload still fails.
  // A stackless fetch failure retries the page once, then shows this quiet message. It is not a page-crash email.
  useEffect(() => {
    reportCrash(error)
    if (!network) return
    const storage = typeof sessionStorage === 'undefined' ? null : sessionStorage
    if (claimNetworkRetry(storage)) reset()
  }, [error, network, reset])
  if (network) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-3xl font-black tracking-tight">The signal dropped.</h1>
        <p className="text-muted-foreground">This page is fine. The connection blinked, which happens on a phone. Give it another go?</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="outline" asChild><Link href="/">Back to what&apos;s on</Link></Button>
        </div>
      </main>
    )
  }
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-black tracking-tight">Well, that wasn&apos;t on the programme.</h1>
      <p className="text-muted-foreground">This page tripped over its own feet. We&apos;ve already been told and we&apos;re on it. Give it another go?</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => reset()}>Try Again</Button>
        <Button variant="outline" asChild><Link href="/">Back to what&apos;s on</Link></Button>
      </div>
    </main>
  )
}
