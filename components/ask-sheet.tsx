'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import Link from 'next/link'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const AiSearchBar = dynamic(
  () => import('@/components/ai-search-bar').then((m) => m.AiSearchBar),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">Opening Ask…</p> },
)

/** Ask and Plan, from any page that does not already show the hero search. */
export function AskSheet({
  open,
  onOpenChange,
  city,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  city: string
  today: string
}) {
  useEffect(() => {
    if (!open) return
    let stopped = false
    let tries = 0
    const tick = () => {
      if (stopped) return
      const input = document.getElementById('ask-search')
      if (input instanceof HTMLInputElement) {
        input.focus()
        return
      }
      if (tries++ < 40) window.setTimeout(tick, 50)
    }
    tick()
    return () => { stopped = true }
  }, [open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        id="vp-ask-sheet"
        className="vp-ask-sheet z-[80]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="space-y-1 pr-8 text-left">
          <SheetTitle className="font-display">Ask</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Search in your own words, or ask for a plan like “plan my Saturday”. I’ll line up the stops here. Nothing is saved until you add it to your{' '}
            <Link href="/itinerary" className="font-semibold text-primary underline underline-offset-2" onClick={() => onOpenChange(false)}>
              Itinerary
            </Link>
          </SheetDescription>
        </SheetHeader>
        {open && (
          <AiSearchBar
            city={city}
            today={today}
            inputId="ask-search"
            onShowAll={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
