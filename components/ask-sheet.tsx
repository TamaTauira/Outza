'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import Link from 'next/link'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import type { SearchHints } from '@/lib/search-hints'

const AiSearchBar = dynamic(
  () => import('@/components/ai-search-bar').then((m) => m.AiSearchBar),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">Opening Ask…</p> },
)

/** Ask, from every page. Phones dock it on the nav. Desktop centres it. */
export function AskSheet({
  open,
  onOpenChange,
  city,
  today,
  queryRequest,
  returnFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  city: string
  today: string
  queryRequest?: { id: number; text: string; hints?: SearchHints } | null
  returnFocus?: () => void
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
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      id="vp-ask-sheet"
      title="Ask"
      className="vp-ask-sheet z-[80]"
      onCloseAutoFocus={(event) => {
        if (!returnFocus) return
        event.preventDefault()
        returnFocus()
      }}
      description={
        <>
          Search in your own words, or ask for a plan like “plan my Saturday”. I’ll line up the stops here. Nothing is saved until you add it to your{' '}
          <Link href="/itinerary" className="font-semibold text-primary underline underline-offset-2" onClick={() => onOpenChange(false)}>
            Itinerary
          </Link>
          .
        </>
      }
    >
      {open && (
        <AiSearchBar
          city={city}
          today={today}
          inputId="ask-search"
          queryRequest={queryRequest}
          onShowAll={() => onOpenChange(false)}
          onResult={() => onOpenChange(false)}
          surface="theme"
        />
      )}
    </BottomSheet>
  )
}
