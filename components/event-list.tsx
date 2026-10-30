'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { FilterState } from '@/components/filter-panel'
import { knownCategories } from '@/lib/categories'
import { BoardRow, BoardHeadings, GroupBar, getStatus, type BoardEvent } from '@/components/board-row'
import { DAY_PARTS, dayLabel, listSpan, toMinutes, type TimeWindow } from '@/lib/board'
import { isPaidListing } from '@/lib/quality'
import { useSaved } from '@/lib/saved'
import { Loader2, Sparkles, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBackState } from '@/lib/scroll-memory'
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
    let n = 0
    for (const ev of list) {
      const start = toMinutes(ev.time)
      if (start === null) { n++; continue }
      if (isToday) {
        const end = toMinutes(ev.endTime)
        const effectiveEnd = end != null && end > start ? end : start + 180
        if (nowMinutes >= effectiveEnd) continue
      }
      if (w === 'now' && !(start <= nowMinutes || (start >= nowMinutes && start - nowMinutes <= 180))) continue
      if (w === 'hour' && !(start >= nowMinutes && start - nowMinutes <= 60)) continue
      if (w === 'evening' && start < 17 * 60) continue
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
      const start = toMinutes(ev.time)
      if (start === null) { u.push(ev); continue }
      const status = getStatus(ev, rowDay, today, nowMinutes)
      if (status.tone === 'done') ended++
      if (effectiveWindow === 'now' && !(status.tone === 'live' || (start >= nowMinutes && start - nowMinutes <= 180))) continue
      if (effectiveWindow === 'hour' && !(start >= nowMinutes && start - nowMinutes <= 60)) continue
      if (effectiveWindow === 'evening' && start < 17 * 60) continue
      if (hideEnded && status.tone === 'done') continue
      t.push({ ev, status, start, date })
    }
    return { timed: t, untimed: u, endedCount: ended }
  }, [events, day, span, today, nowMinutes, effectiveWindow, hideEnded])

  const groups = DAY_PARTS.map((p) => ({ ...p, rows: timed.filter((r) => r.start >= p.from && r.start < p.to) })).filter((g) => g.rows.length)

  return (
    <div>
      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-5 py-2.5 border-b border-border text-sm text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-free" />
        <span className="font-semibold text-foreground">{loading ? '…' : timed.length}</span> timed events
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
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
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
              <BoardRow key={ev.id} ev={ev} status={status} saved={isSaved(ev.id)} onToggleSave={toggle} showDate={dayLabel(date, today)} />
            ))}
          </section>
        ))
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
                <BoardRow key={ev.id} ev={ev} status={status} saved={isSaved(ev.id)} onToggleSave={toggle} />
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
      {!loading && untimed.length > 0 && (
        <div className="border-t border-border">
          <button onClick={() => setAllDayOpen((o) => !o)} className="w-full flex items-center gap-3 px-3 sm:px-5 py-3.5 text-left hover:bg-muted/50" aria-expanded={allDayOpen}>
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Also on {day ? dayLabel(day, today).toLowerCase() : 'today'} · exhibitions, markets & all-day events</span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">{untimed.length}</span>
            <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform', allDayOpen && 'rotate-90')} />
          </button>
          {allDayOpen && day && untimed.map((ev) => (
            <BoardRow key={ev.id} ev={ev} status={getStatus(ev, day, today, nowMinutes)} saved={isSaved(ev.id)} onToggleSave={toggle} />
          ))}
        </div>
      )}
    </div>
  )
}

function PeepEmpty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-16 text-center">
      <p className="mb-1 font-semibold">{title}</p>
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  )
}
