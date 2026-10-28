'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { reportCrash } from '@/components/report-crash'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportCrash(error) }, [error])
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-black tracking-tight">Well, that wasn&apos;t on the programme.</h1>
      <p className="text-muted-foreground">This page tripped over its own feet. We&apos;ve already been told and we&apos;re on it. Give it another go?</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => reset()}>Try Again</Button>
        <Button variant="outline" asChild><BackToEventsLink>Back to events</BackToEventsLink></Button>
      </div>
    </main>
  )
}
