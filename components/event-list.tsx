'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { FilterState } from '@/components/filter-panel'
import { BoardRow, BoardHeadings, GroupBar, getStatus, type BoardEvent } from '@/components/board-row'
import { DAY_PARTS, dayLabel, toMinutes, type TimeWindow } from '@/lib/board'
import { isPaidListing } from '@/lib/quality'
import { useSaved } from '@/lib/saved'
import { Loader2, CalendarDays, Sparkles, ChevronRight, MousePointerClick } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBackState } from '@/lib/scroll-memory'

interface EventListProps {
  filters: FilterState
  searchQuery: string
  day: string | null
  days: string[]
  today: string | null
  nowMinutes: number
  timeWindow: TimeWindow
  onWindowChange?: (w: TimeWindow) => void
  windowPinned?: boolean
  onDayChange: (day: string) => void
  city?: string
}

export function EventList({ filters, searchQuery, day, days, today, nowMinutes, timeWindow, onWindowChange, windowPinned, onDayChange, city }: EventListProps) {
  const [events, setEvents] = useState<BoardEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  // Ended rows are hidden by default; "Show ended" is the opt-in.
  const [showEnded, setShowEnded] = useBackState('board:showEnded', false)
  const hideEnded = !showEnded
  const [closed, setClosed] = useBackState<Record<string, boolean>>('board:closed', {})
  const [allDayOpen, setAllDayOpen] = useBackState('board:allDayOpen', false)
  const { isSaved, toggle } = useSaved()
  const fetchSeq = useRef(0)

  const fetchDay = useCallback(async (d: string, pageNum: number, append: boolean) => {
    const seq = ++fetchSeq.current
    try {
      if (append) setLoadingMore(true)
      else setLoading(true)
      const params = new URLSearchParams({ page: String(pageNum), limit: '300', dateFrom: d, dateTo: d })
      if (searchQuery) params.set('search', searchQuery)
      if (city) params.set('city', city)
      if (filters.category) params.set('category', filters.category)
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
  }, [searchQuery, city, filters.category, filters.subTag, filters.suburb, filters.isFree, filters.isLGBTI])

  useEffect(() => {
    if (!day) return
    setPage(1)
    fetchDay(day, 1, false)
  }, [day, fetchDay])

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
    if (windowPinned || loading) return requestedWindow
    if (countFor(events, requestedWindow) > 0) return requestedWindow
    if (countFor(events, 'evening') > 0) return 'evening'
    if (countFor(events, 'all') > 0) return 'all'
    return requestedWindow
  }, [windowPinned, loading, requestedWindow, events, nowMinutes])

  useEffect(() => {
    if (!windowPinned && !loading && effectiveWindow !== timeWindow) onWindowChange?.(effectiveWindow)
  }, [windowPinned, loading, effectiveWindow, timeWindow, onWindowChange])

  const { timed, untimed, endedCount } = useMemo(() => {
    const t: { ev: BoardEvent; status: ReturnType<typeof getStatus>; start: number }[] = []
    const u: BoardEvent[] = []
    let ended = 0
    if (!day) return { timed: t, untimed: u, endedCount: 0 }
    for (const ev of events) {
      const start = toMinutes(ev.time)
      if (start === null) { u.push(ev); continue }
      const status = getStatus(ev, day, today, nowMinutes)
      if (status.tone === 'done') ended++
      if (effectiveWindow === 'now' && !(status.tone === 'live' || (start >= nowMinutes && start - nowMinutes <= 180))) continue
      if (effectiveWindow === 'hour' && !(start >= nowMinutes && start - nowMinutes <= 60)) continue
      if (effectiveWindow === 'evening' && start < 17 * 60) continue
      if (hideEnded && status.tone === 'done') continue
      t.push({ ev, status, start })
    }
    return { timed: t, untimed: u, endedCount: ended }
  }, [events, day, today, nowMinutes, effectiveWindow, hideEnded])

  const groups = DAY_PARTS.map((p) => ({ ...p, rows: timed.filter((r) => r.start >= p.from && r.start < p.to) })).filter((g) => g.rows.length)

  return (
    <div>
      {/* Summary row */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 sm:px-5 py-2.5 border-b border-border">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-free" />
          <span className="font-semibold text-foreground">{loading ? '…' : timed.length}</span> timed events
          {!loading && untimed.length > 0 && <span>· {untimed.length} all-day</span>}
          {isToday && endedCount > 0 && effectiveWindow !== 'now' && effectiveWindow !== 'hour' && (
            <label className="ml-2 inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} className="w-4 h-4 accent-[hsl(var(--primary))]" />
              Show ended ({endedCount})
            </label>
          )}
        </div>
        <div className="flex items-center gap-4">
          <label className="relative flex items-center gap-2 text-sm">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <select
              value={day ?? ''}
              onChange={(e) => onDayChange(e.target.value)}
              className="bg-transparent font-medium pr-1 focus:outline-none cursor-pointer"
              aria-label="Choose a day"
            >
              {days.map((d) => (
                <option key={d} value={d} className="bg-popover text-popover-foreground">{dayLabel(d, today)}</option>
              ))}
            </select>
          </label>
          <span className="hidden md:inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <MousePointerClick className="w-3.5 h-3.5" /> Tap a row for the goods
          </span>
        </div>
      </div>

      <BoardHeadings />

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-20 px-4">
          <p className="font-semibold mb-1">Crickets…</p>
          <p className="text-sm text-muted-foreground">
            {effectiveWindow !== 'all' ? 'Nothing in this window. Hit “Full day”, pick another date or loosen your filters.' : 'Try widening the dates: pick another date or loosen your filters.'}
          </p>
          {effectiveWindow !== 'all' && onWindowChange && (
            <button onClick={() => onWindowChange('all')} className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">Show Full Day</button>
          )}
        </div>
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

      {!loading && page < totalPages && day && (
        <div className="flex justify-center py-5 border-t border-border">
          <button
            onClick={() => { const n = page + 1; setPage(n); fetchDay(day, n, true) }}
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
