'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { BoardRow, BoardHeadings, GroupBar, getStatus } from '@/components/board-row'
import { dayLabel } from '@/lib/board'
import { useSaved } from '@/lib/saved'
import { Bookmark } from 'lucide-react'

export function SavedBoard({ today, nowMinutes, onBrowse }: { today: string | null; nowMinutes: number; onBrowse: () => void }) {
  const { saved, isSaved, toggle, signedIn } = useSaved()

  const byDay = useMemo(() => {
    // Same list the navbar badge counts (useSaved already hides past events), so the two always agree.
    const sorted = [...saved].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))
    const map = new Map<string, typeof sorted>()
    for (const ev of sorted) {
      const k = ev.date.slice(0, 10)
      map.set(k, [...(map.get(k) ?? []), ev])
    }
    return [...map.entries()]
  }, [saved])

  if (byDay.length === 0) {
    return (
      <div className="text-center py-20 px-4">
        <Bookmark className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
        <p className="font-semibold mb-1">{signedIn ? 'No keepers yet' : 'Sign in to see your saved events'}</p>
        <p className="text-sm text-muted-foreground mb-5">{signedIn ? 'Go find some favourites. We’ll hold them for you.' : 'Saved events belong to your account. Nothing is kept while you’re signed out.'}</p>
        {signedIn
          ? <button onClick={onBrowse} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">Browse the Board</button>
          : <Link href="/login?next=/saved" className="inline-flex px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">Sign in</Link>}
      </div>
    )
  }

  return (
    <div>
      <BoardHeadings />
      {byDay.map(([day, list]) => (
        <section key={day}>
          <GroupBar label={dayLabel(day, today)} count={list.length} open onToggle={() => {}} />
          {list.map((ev) => (
            <BoardRow key={ev.id} ev={ev} status={getStatus(ev, day, today, nowMinutes)} saved={isSaved(ev.id)} onToggleSave={toggle} />
          ))}
        </section>
      ))}
    </div>
  )
}
