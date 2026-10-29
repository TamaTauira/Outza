'use client'

import { useMemo } from 'react'
import { BoardRow, BoardHeadings, GroupBar, getStatus } from '@/components/board-row'
import { dayLabel } from '@/lib/board'
import { useSaved } from '@/lib/saved'
import { EmptyState } from '@/components/empty-state'

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
      <EmptyState
        title={signedIn ? 'No keepers yet' : 'Sign in to see your saved events'}
        lede={signedIn ? 'Go find some favourites. We’ll hold them for you.' : 'Saved events belong to your account. Nothing is kept while you’re signed out.'}
        action={signedIn ? { label: 'Browse events', onClick: onBrowse } : { href: '/login?next=/saved', label: 'Sign in' }}
        secondary={signedIn ? undefined : { href: '/', label: 'Browse events' }}
        examples={['Friday · Outdoor yoga · Rose Bay', 'Saturday · Live music · The Rocks', 'Sunday · Market · Bondi']}
      />
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
