'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { FilterState } from '@/components/filter-panel'
import { knownCategories } from '@/lib/categories'
import { BoardRow, BoardHeadings, GroupBar, getStatus, type BoardEvent } from '@/components/board-row'
import { DAY_PARTS, dayLabel, listSpan, orderedDayParts, toMinutes, type TimeWindow } from '@/lib/board'
import { rankBoard, resolveSchedule } from '@/lib/listing-window'
import { isPaidListing } from '@/lib/quality'
import { useSaved } from '@/lib/saved'
import { Loader2, Sparkles, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBackState } from '@/lib/scroll-memory'
import { VibePeepMascot } from '@/components/vibepeep-mascot'

export type BoardSeed = {
  city: string
  from: string
  to: string
  events: BoardEvent[]
  total: number
  totalPages: number
}

interface EventListProps {
  filters: FilterState
  searchQuery: string
  day: string | null
  today: string | null
  nowMinutes: number
  timeWindow: TimeWindow
  onWindowChange?: (w: TimeWindow) => void
  windowPinned?: boolean
  city?: string
  initialBoard?: BoardSeed | null
}

function filtersAreOpen(filters: FilterState) {
  return Boolean(
    filters.category || filters.categories?.length || filters.subTag || filters.suburb ||
    filters.isFree || filters.isLGBTI || filters.dateFrom || filters.dateTo,
  )
}

export function EventList({ filters, searchQuery, day, today, nowMinutes, timeWindow, onWindowChange, windowPinned, city, initialBoard = null }: EventListProps) {
  const { status: authStatus } = useSession()
  const span = listSpan(day, filters.dateFrom, filters.dateTo)
  const seedMatches = !!initialBoard
    && !searchQuery
    && !filtersAreOpen(filters)
    && (city ?? '') === initialBoard.city
    && !!span
    && span.from === initialBoard.from
    && span.to === initialBoard.to
  const [events, setEvents] = useState<BoardEvent[]>(initialBoard && seedMatches ? initialBoard.events : [])
  const [total, setTotal] = useState(initialBoard && seedMatches ? initialBoard.total : 0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(initialBoard && seedMatches ? initialBoard.totalPages : 1)
  const [loading, setLoading] = useState(!(initialBoard && seedMatches))
  const [loadingMore, setLoadingMore] = useState(false)
  // Ended rows are hidden by default; "Show ended" is the opt-in.
  const [showEnded, setShowEnded] = useBackState('board:showEnded', false)
  const hideEnded = !showEnded
  const [closed, setClosed] = useBackState<Record<string, boolean>>('board:closed', {})
  const [allDayOpen, setAllDayOpen] = useBackState('board:allDayOpen', false)
  const { isSaved, toggle } = useSaved()
  const fetchSeq = useRef(0)

  const fetchSpan = useCallback(async (from: string, to: string, pageNum: number, append: boolean) => {
    const seq = ++fetchSeq.current
    try {
      if (append) setLoadingMore(true)
      else setLoading(true)
      const params = new URLSearchParams({ page: String(pageNum), limit: '300', dateFrom: from, dateTo: to })
      if (searchQuery) params.set('search', searchQuery)
      if (city) params.set('city', city)
      const cats = knownCategories(filters.categories?.length ? filters.categories : filters.category ? [filters.category] : [])
      if (cats.length === 1) params.set('category', cats[0])
      else if (cats.length > 1) params.set('categories', cats.join(','))
      if (filters.subTag) params.set('subTag', filters.subTag)
      if (filters.suburb) params.set('suburb', filters.suburb)
      if (filters.isFree) params.set('isFree', 'true')
      if (filters.isLGBTI) params.set('isLGBTI', 'true')
      const res = await fetch(`/api/events?${params.toString()}`)
      const data = await res.json()
      if (seq !== fetchSeq.current) return
      const list: BoardEvent[] = (data?.events ?? []).filter((ev: BoardEvent) => !filters.isFree || !isPaidListing(ev))
      setEvents((prev) => (append ? [...prev, ...list] : list))
      setTotal(data?.total ?? 0)
      setTotalPages(data?.totalPages ?? 1)
    } catch (err) {
      console.error('Failed to fetch events:', err)
    } finally {
      if (seq === fetchSeq.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [searchQuery, city, filters.category, filters.categories, filters.subTag, filters.suburb, filters.isFree, filters.isLGBTI])

  useEffect(() => {
    if (!span || authStatus === 'loading') return
    // Anonymous visitors use the server-rendered day. Signed-in visitors refetch for their own flags.
    if (initialBoard && seedMatches && authStatus !== 'authenticated') {
      setEvents(initialBoard.events)
      setTotal(initialBoard.total)
      setTotalPages(initialBoard.totalPages)
      setPage(1)
      setLoading(false)
      return
    }
    setPage(1)
    fetchSpan(span.from, span.to, 1, false)
  }, [span?.from, span?.to, fetchSpan, seedMatches, authStatus, initialBoard])

  const isToday = !!day && day === today
  const requestedWindow: TimeWindow = isToday ? timeWindow : timeWindow === 'evening' ? 'evening' : 'all'

  const countFor = (list: BoardEvent[], w: TimeWindow) => {
    const dayKey = day ?? today ?? ''
    if ((w === 'now' || w === 'evening') && dayKey) {
      const ranked = rankBoard(list, {
        window: w === 'evening' ? 'tonight' : 'now',
        day: dayKey,
        nowMinutes,
        dropEnded: true,
      })
      return ranked.lead.length + ranked.soon.length + ranked.still.length + ranked.allday.length + ranked.possibly.length
    }
    let n = 0
    for (const ev of list) {
      const rowDay = day ?? String(ev.date).slice(0, 10)
      const sched = resolveSchedule(ev, rowDay)
      if (sched.dropIn) continue
      const start = sched.start
      if (start === null) continue
      if (isToday && getStatus(ev, rowDay, today, nowMinutes).tone === 'done') continue
      if (w === 'hour' && !(start >= nowMinutes && start - nowMinutes <= 60)) continue
      n++
    }
    return n
  }

  const effectiveWindow: TimeWindow = useMemo(() => {
    if (span?.spanning) return 'all'
    if (windowPinned || loading) return requestedWindow
    if (countFor(events, requestedWindow) > 0) return requestedWindow
    if (countFor(events, 'evening') > 0) return 'evening'
    if (countFor(events, 'all') > 0) return 'all'
    return requestedWindow
  }, [span?.spanning, windowPinned, loading, requestedWindow, events, nowMinutes])

  useEffect(() => {
    if (span?.spanning) return
    if (!windowPinned && !loading && effectiveWindow !== timeWindow) onWindowChange?.(effectiveWindow)
  }, [span?.spanning, windowPinned, loading, effectiveWindow, timeWindow, onWindowChange])

  const { timed, untimed, endedCount } = useMemo(() => {
    const t: { ev: BoardEvent; status: ReturnType<typeof getStatus>; start: number; date: string }[] = []
    const u: BoardEvent[] = []
    let ended = 0
    if (!span) return { timed: t, untimed: u, endedCount: 0 }
    for (const ev of events) {
      const date = String(ev.date).slice(0, 10)
      const rowDay = span.spanning ? date : (day ?? span.from)
      const sched = resolveSchedule(ev, rowDay)
      const status = getStatus(ev, rowDay, today, nowMinutes)
      // No clock, or a midnight-to-late guide time: not a morning session on a single day.
      if (sched.start === null) {
        if (status.tone === 'done') ended++
        if (!(hideEnded && status.tone === 'done')) u.push(ev)
        continue
      }
      if (sched.dropIn) {
        if (status.tone === 'done') ended++
        if (hideEnded && status.tone === 'done') continue
        if (span.spanning) t.push({ ev, status, start: sched.start, date })
        else if (effectiveWindow === 'all') u.push(ev)
        continue
      }
      const start = sched.start
      if (status.tone === 'done') ended++
      if (effectiveWindow === 'hour' && !(start >= nowMinutes && start - nowMinutes <= 60)) continue
      if (effectiveWindow === 'evening' && start < 17 * 60) continue
      if (hideEnded && status.tone === 'done') continue
      t.push({ ev, status, start, date })
    }
    return { timed: t, untimed: u, endedCount: ended }
  }, [events, day, span, today, nowMinutes, effectiveWindow, hideEnded])

  const windowRank = useMemo(() => {
    if (!span || span.spanning || (effectiveWindow !== 'now' && effectiveWindow !== 'evening')) return null
    const dayKey = day ?? span.from
    return rankBoard(events, {
      window: effectiveWindow === 'evening' ? 'tonight' : 'now',
      day: dayKey,
      nowMinutes,
      dropEnded: !!today && dayKey === today && hideEnded,
    })
  }, [events, day, span, today, nowMinutes, effectiveWindow, hideEnded])

  const rowFor = (ev: BoardEvent) => {
    const date = String(ev.date).slice(0, 10)
    const rowDay = day ?? date
    return { ev, status: getStatus(ev, rowDay, today, nowMinutes), start: toMinutes(ev.time) ?? 0, date }
  }
  const partOrder = isToday ? orderedDayParts(nowMinutes) : [...DAY_PARTS]
  const groups = partOrder.map((p) => ({ ...p, rows: timed.filter((r) => r.start >= p.from && r.start < p.to) })).filter((g) => g.rows.length)
  const eveningGroups = windowRank && effectiveWindow === 'evening'
    ? partOrder.map((p) => ({
      ...p,
      rows: [...windowRank.lead, ...windowRank.soon].flatMap((ev) => {
        const row = rowFor(ev)
        if (row.start < p.from || row.start >= p.to) return []
        return [row]
      }),
    })).filter((g) => g.rows.length)
    : []
  const nowSections = windowRank && effectiveWindow === 'now'
    ? [
      { key: 'on', label: 'On now', rows: windowRank.lead.map(rowFor), possibly: false },
      { key: 'next', label: 'Starting soon', rows: windowRank.soon.map(rowFor), possibly: false },
      { key: 'still', label: 'Still on', rows: windowRank.still.map(rowFor), possibly: false },
      { key: 'allday', label: 'All day', rows: windowRank.allday.map(rowFor), possibly: false },
      { key: 'possibly', label: 'Possibly available', rows: windowRank.possibly.map(rowFor), possibly: true },
    ].filter((section) => section.rows.length)
    : []

  return (
    <div>
      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-5 py-2.5 border-b border-border text-sm text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-free" />
        <span className="font-semibold text-foreground">{loading ? '…' : (windowRank ? windowRank.lead.length + windowRank.soon.length + windowRank.still.length : timed.length)}</span> timed events
        {span?.spanning && !loading && <span>· {dayLabel(span.from, today)} – {dayLabel(span.to, today)}</span>}
        {!loading && untimed.length > 0 && <span>· {untimed.length} all-day</span>}
        {isToday && endedCount > 0 && effectiveWindow !== 'now' && effectiveWindow !== 'hour' && (
          <label className="ml-2 inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} className="w-4 h-4 accent-[hsl(var(--primary))]" />
            Show ended ({endedCount})
          </label>
        )}
      </div>

      <BoardHeadings />

      {loading ? (
        <div aria-busy="true" aria-label="Loading events">
          <div className="flex flex-col items-center justify-center gap-2 py-8" aria-live="polite">
            <VibePeepMascot className="w-16" alt="" />
            <p className="text-sm text-muted-foreground">Having a peep…</p>
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="px-5 py-4 flex gap-4">
                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : span?.spanning && timed.length === 0 ? (
        <PeepEmpty title="Crickets. I checked twice." body="Nothing in that date range. Widen the dates or loosen your filters." />
      ) : span?.spanning ? (
        [...timed.reduce((map, row) => map.set(row.date, [...(map.get(row.date) ?? []), row]), new Map<string, typeof timed>())].map(([date, rows]) => (
          <section key={date}>
            <GroupBar label={dayLabel(date, today)} count={rows.length} open={!closed[date]} onToggle={() => setClosed((c) => ({ ...c, [date]: !c[date] }))} />
            {!closed[date] && rows.map(({ ev, status }) => (
              <BoardRow key={ev.id} ev={ev} status={status} saved={isSaved(ev.id)} onToggleSave={toggle} showDate={dayLabel(date, today)} trackSearch={!!searchQuery} />
            ))}
          </section>
        ))
      ) : windowRank ? (
        <>
          {(effectiveWindow === 'now' ? nowSections.length === 0 : eveningGroups.length === 0 && windowRank.possibly.length === 0) ? (
            <PeepEmpty
              title="Crickets. I checked twice."
              body="Nothing with a confirmed time in this window. Untimed listings are listed separately when we have them."
              action={onWindowChange ? (
                <button onClick={() => onWindowChange('all')} className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">Show Full Day</button>
              ) : null}
            />
          ) : effectiveWindow === 'now' ? nowSections.map((section) => {
            const open = !closed[section.key]
            return (
              <section key={section.key}>
                <GroupBar label={section.label} count={section.rows.length} open={open} onToggle={() => setClosed((c) => ({ ...c, [section.key]: open }))} />
                {open && section.rows.map(({ ev }) => (
                  <BoardRow
                    key={ev.id}
                    ev={ev}
                    status={section.possibly ? { label: 'Possibly available', tone: 'tbc' } : getStatus(ev, day ?? String(ev.date).slice(0, 10), today, nowMinutes)}
                    saved={isSaved(ev.id)}
                    onToggleSave={toggle}
                    trackSearch={!!searchQuery}
                  />
                ))}
              </section>
            )
          }) : eveningGroups.map((g) => {
            const open = !closed[g.key]
            return (
              <section key={g.key}>
                <GroupBar label={g.label} count={g.rows.length} open={open} onToggle={() => setClosed((c) => ({ ...c, [g.key]: open }))} />
                {open && g.rows.map(({ ev, status }) => (
                  <BoardRow key={ev.id} ev={ev} status={status} saved={isSaved(ev.id)} onToggleSave={toggle} trackSearch={!!searchQuery} />
                ))}
              </section>
            )
          })}
          {effectiveWindow === 'evening' && windowRank.possibly.length > 0 && (
            <section>
              <GroupBar label="Possibly available" count={windowRank.possibly.length} open={!closed.possibly} onToggle={() => setClosed((c) => ({ ...c, possibly: !c.possibly }))} />
              {!closed.possibly && windowRank.possibly.map((ev) => (
                <BoardRow key={ev.id} ev={ev} status={{ label: 'Possibly available', tone: 'tbc' }} saved={isSaved(ev.id)} onToggleSave={toggle} trackSearch={!!searchQuery} />
              ))}
            </section>
          )}
        </>
      ) : groups.length === 0 ? (
        <PeepEmpty
          title="Crickets. I checked twice."
          body={effectiveWindow !== 'all' ? 'Nothing in this window. Hit “Full day”, pick another date or loosen your filters.' : 'Try widening the dates: pick another date or loosen your filters.'}
          action={effectiveWindow !== 'all' && onWindowChange ? (
            <button onClick={() => onWindowChange('all')} className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">Show Full Day</button>
          ) : null}
        />
      ) : (
        groups.map((g) => {
          const open = !closed[g.key]
          return (
            <section key={g.key}>
              <GroupBar label={g.label} count={g.rows.length} open={open} onToggle={() => setClosed((c) => ({ ...c, [g.key]: open }))} />
              {open && g.rows.map(({ ev, status }) => (
                <BoardRow key={ev.id} ev={ev} status={status} saved={isSaved(ev.id)} onToggleSave={toggle} trackSearch={!!searchQuery} />
              ))}
            </section>
          )
        })
      )}

      {!loading && page < totalPages && span && (
        <div className="flex justify-center py-5 border-t border-border">
          <button
            onClick={() => { const n = page + 1; setPage(n); fetchSpan(span.from, span.to, n, true) }}
            disabled={loadingMore}
            className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            Load More ({Math.max(total - events.length, 0)} remaining)
          </button>
        </div>
      )}

      {/* All-day / untimed */}
      {!loading && !windowRank && untimed.length > 0 && (
        <div className="border-t border-border">
          <button onClick={() => setAllDayOpen((o) => !o)} className="w-full flex items-center gap-3 px-3 sm:px-5 py-3.5 text-left hover:bg-muted/50" aria-expanded={allDayOpen}>
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Also on {day ? dayLabel(day, today).toLowerCase() : 'today'} · exhibitions, markets & all-day events</span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">{untimed.length}</span>
            <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform', allDayOpen && 'rotate-90')} />
          </button>
          {allDayOpen && day && untimed.map((ev) => (
            <BoardRow key={ev.id} ev={ev} status={getStatus(ev, day, today, nowMinutes)} saved={isSaved(ev.id)} onToggleSave={toggle} trackSearch={!!searchQuery} />
          ))}
        </div>
      )}
    </div>
  )
}

function PeepEmpty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-16 text-center">
      <VibePeepMascot className="mx-auto w-24 sm:w-28" alt="" />
      <p className="mb-1 mt-3 font-semibold">{title}</p>
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  )
}
