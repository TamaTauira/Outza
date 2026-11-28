'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { FilterState } from '@/components/filter-panel'
import { areaGroupFor, CATEGORIES, knownCategories } from '@/lib/categories'
import { boardDisplayName } from '@/lib/cities'
import { BoardRow, BoardHeadings, GroupBar, getStatus, type BoardEvent, type Status } from '@/components/board-row'
import { ListingBoardCard } from '@/components/listing-board-card'
import { ItineraryButton } from '@/components/itinerary-button'
import { DAY_PARTS, categoryIcon, dayLabel, listSpan, orderedDayParts, toMinutes, type TimeWindow } from '@/lib/board'
import { listPriceLabel, priceFeeNote } from '@/lib/price'
import { formatBoardRange, rankBoard, resolveSchedule } from '@/lib/listing-window'
import { isPaidListing } from '@/lib/quality'
import { useSaved } from '@/lib/saved'
import { ChevronRight, Loader2, Sparkles } from 'lucide-react'
import { SaveButton } from '@/components/save-button'
import { cn } from '@/lib/utils'
import { holdScrollRestore, isHistoryNav, readListDepth, useBackState, writeListDepth } from '@/lib/scroll-memory'
import { boardPagesToLoad, boardTopUpAppendFailed, boardTopUpTarget } from '@/lib/scroll-restore'
import { ReachBeacon } from '@/components/reach-beacon'
import { displaySuburb, tidyVenueName } from '@/lib/cities'
import { displayTitle, parentCategory } from '@/lib/display-public'
import { listPlaceLine } from '@/components/list-clock'
import { eventPath } from '@/lib/seo'
import { armReconnect, createReconnectRetry, readJson } from '@/lib/client-fetch'
import { cityDataIsStale } from '@/lib/city-pref'
import { boardCountGate, boardDataIsStale, boardLoadIsWindowed, boardQueryKey } from '@/lib/board-query'
export type BoardSeed = {
  city: string
  from: string
  to: string
  events: BoardEvent[]
  total: number
  totalPages: number
  /** Ended rows inside total, from the same server set (see board-feed). */
  endedTotal?: number
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
  activeId?: string | null
  layout?: 'list' | 'board'
  /** Ids already shown in the Peep rails, so the preview does not repeat them. */
  excludeIds?: string[]
  /** When set, only this many rows render. Omit it for the full list. */
  previewLimit?: number
  onListedCount?: (count: number) => void
}

function filtersAreOpen(filters: FilterState) {
  return Boolean(
    filters.category || filters.categories?.length || filters.subTag || filters.suburb ||
    filters.isFree || filters.isLGBTI || filters.dateFrom || filters.dateTo,
  )
}

export function EventList({ filters, searchQuery, day, today, nowMinutes, timeWindow, onWindowChange, windowPinned, city, initialBoard = null, activeId = null, layout = 'list', excludeIds = [], previewLimit, onListedCount }: EventListProps) {
  const { status: authStatus } = useSession()
  const span = listSpan(day, filters.dateFrom, filters.dateTo)
  const seedMatches = !!initialBoard
    && !searchQuery
    && !filtersAreOpen(filters)
    && (city ?? '') === initialBoard.city
    && !!span
    && span.from === initialBoard.from
    && span.to === initialBoard.to
  // The identity of the query the board is currently asking for, in the
  // same terms fetchSpan fetches by. Held rows and totals are only ever
  // presented under the query that loaded them (see staleQuery below).
  const queryKey = span
    ? boardQueryKey({
      from: span.from,
      to: span.to,
      city,
      search: searchQuery,
      categories: knownCategories(filters.categories?.length ? filters.categories : filters.category ? [filters.category] : []),
      subTag: filters.subTag,
      suburb: filters.suburb,
      isFree: filters.isFree,
      isLGBTI: filters.isLGBTI,
    })
    : null
  const [events, setEvents] = useState<BoardEvent[]>(initialBoard && seedMatches ? initialBoard.events : [])
  const [total, setTotal] = useState(initialBoard && seedMatches ? initialBoard.total : 0)
  const [endedTotal, setEndedTotal] = useState(initialBoard && seedMatches ? initialBoard.endedTotal ?? 0 : 0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(initialBoard && seedMatches ? initialBoard.totalPages : 1)
  const [loading, setLoading] = useState(!(initialBoard && seedMatches))
  const [offline, setOffline] = useState(false)
  // The city the held rows and total were loaded for. The summary count is
  // computed from the held rows, so the count (and the rows) may only be
  // presented under the selected city's name when the two match — see
  // staleCity below.
  const [dataCity, setDataCity] = useState<string | null>(initialBoard && seedMatches ? initialBoard.city : null)
  // The query key the held rows and total were loaded under, recorded by
  // every successful fetch (and by the seed application below).
  const [dataKey, setDataKey] = useState<string | null>(initialBoard && seedMatches ? queryKey : null)
  // The query whose first load stopped at the page ceiling (see
  // boardPagesToLoad): its held set can never complete, so its windowed
  // headline falls back to the server's full-set numbers rather than
  // publishing a partial count (see boardCountGate).
  const [cappedKey, setCappedKey] = useState<string | null>(null)
  // The rows on screen must belong to the city the heading names. The heading
  // and picker follow HomeClient's resolved city the moment it lands, but this
  // list used to keep whatever it already held — the Sydney server seed, or a
  // previous city's fetch — until a fetch for the new city completed, and if
  // that fetch was skipped or failed the wrong city stayed up indefinitely
  // (E2E-13). So when the city changes, drop the previous city's rows and go
  // back to the loading state; the fetch below fills in the new city.
  const [prevCity, setPrevCity] = useState(city)
  if (prevCity !== city) {
    setPrevCity(city)
    setEvents([])
    setTotal(0)
    setEndedTotal(0)
    setTotalPages(1)
    setPage(1)
    setLoading(true)
    setDataCity(null)
    setDataKey(null)
    setCappedKey(null)
  }
  // Held data loaded for another city is stale the moment the selection
  // moves on, whatever path put it there (a fetch or seed application that
  // completed after the switch, say). While stale, the list presents its
  // loading state — the summary shows no number and no rows render — until
  // this city's fetch lands.
  const staleCity = cityDataIsStale(dataCity, city, events.length + total)
  // The same treatment for the query itself. When the span or a filter
  // moves, the held rows and total still belong to the previous query
  // until the new query's fetch lands — but the summary kept publishing
  // that previous total in the meantime, with the date-range suffix
  // withheld until loading finished, so a bare count for the old query
  // showed first and the count and suffix only updated together at the
  // end (Today -> This weekend: the old total, then the span's). While
  // the held data is stale for the current query, the list presents its
  // loading state, exactly as it does for a stale city. A load-more for
  // the same query keeps its key, so the count stays stable across it.
  const staleQuery = queryKey !== null && boardDataIsStale(dataKey, queryKey, events.length + total)
  const listed = events
  const railSkip = useMemo(() => new Set(excludeIds), [excludeIds])
  const [loadingMore, setLoadingMore] = useState(false)
  // Ended rows are hidden by default; "Show ended" is the opt-in.
  const [showEnded, setShowEnded] = useBackState('board:showEnded', false)
  const hideEnded = !showEnded
  const [closed, setClosed] = useBackState<Record<string, boolean>>('board:closed', {})
  const [allDayOpen, setAllDayOpen] = useBackState('board:allDayOpen', false)
  const { isSaved, toggle } = useSaved()
  const fetchSeq = useRef(0)
  // Guards and mirrors for the window-switch top-up below. Its loop is
  // async and outlives the render that started it, so it reads the
  // current query, window and page total from refs the top-up effect
  // refreshes on every run, rather than from its own closure. The
  // settled mark records the query a top-up already completed, so it
  // cannot re-fire for that query; the failed mark records the query
  // a top-up append genuinely failed for (boardTopUpAppendFailed), so
  // the effect cannot re-fire that attempt either. A fresh first load
  // (the load effect or reloadInitial) clears both marks, because a
  // new load can leave the held set short again under a different
  // window.
  const topUpQueryRef = useRef<string | null>(null)
  const topUpWindowedRef = useRef(false)
  const topUpTotalPagesRef = useRef(1)
  const topUpRunningRef = useRef(false)
  const topUpSettledRef = useRef<string | null>(null)
  const topUpFailedRef = useRef<string | null>(null)

  const fetchSpan = useCallback(async (from: string, to: string, pageNum: number, append: boolean) => {
    const seq = ++fetchSeq.current
    try {
      if (append) setLoadingMore(true)
      else setLoading(true)
      const params = new URLSearchParams({ page: String(pageNum), limit: '300', dateFrom: from, dateTo: to })
      if (searchQuery) params.set('search', searchQuery)
      if (city) params.set('city', city)
      const cats = knownCategories(filters.categories?.length ? filters.categories : filters.category ? [filters.category] : [])
      const requestKey = boardQueryKey({ from, to, city, search: searchQuery, categories: cats, subTag: filters.subTag, suburb: filters.suburb, isFree: filters.isFree, isLGBTI: filters.isLGBTI })
      if (cats.length === 1) params.set('category', cats[0])
      else if (cats.length > 1) params.set('categories', cats.join(','))
      if (filters.subTag) params.set('subTag', filters.subTag)
      if (filters.suburb) params.set('suburb', filters.suburb)
      if (filters.isFree) params.set('isFree', 'true')
      if (filters.isLGBTI) params.set('isLGBTI', 'true')
      const result = await readJson<{ events?: BoardEvent[]; total?: number; totalPages?: number; endedTotal?: number }>(`/api/events?${params.toString()}`)
      if (seq !== fetchSeq.current || (!result.ok && result.reason === 'abort')) return null
      if (!result.ok) {
        if (result.reason === 'network') setOffline(true)
        else console.error('Failed to fetch events:', result.status)
        return null
      }
      const data = result.data
      const list: BoardEvent[] = (data?.events ?? []).filter((ev: BoardEvent) => !filters.isFree || !isPaidListing(ev))
      setEvents((prev) => (append ? [...prev, ...list] : list))
      const totalPages = data?.totalPages ?? 1
      setTotal(data?.total ?? 0)
      setEndedTotal(data?.endedTotal ?? 0)
      setDataCity(city ?? '')
      setDataKey(requestKey)
      setTotalPages(totalPages)
      setOffline(false)
      return { totalPages }
    } catch (err) {
      console.error('Failed to fetch events:', err)
      return null
    } finally {
      if (seq === fetchSeq.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [searchQuery, city, filters.category, filters.categories, filters.subTag, filters.suburb, filters.isFree, filters.isLGBTI])

  const isToday = !!day && day === today
  const requestedWindow: TimeWindow = isToday ? timeWindow : timeWindow === 'evening' ? 'evening' : 'all'
  // The one window decision the first load, the count gate and the
  // window-switch top-up all take (see boardLoadIsWindowed), computed
  // once per render so the three can never read it differently.
  const loadWindowed = boardLoadIsWindowed({ requestedWindow, windowPinned })

  useEffect(() => {
    if (!span || authStatus === 'loading') return
    topUpSettledRef.current = null
    topUpFailedRef.current = null
    let cancelled = false
    const release = holdScrollRestore('board-list')
    // Read before the depth writer below replaces a saved page count with 1.
    const depthWanted = isHistoryNav() ? readListDepth() : 1
    // The remaining pages of this span's first load, fetched in order. A
    // windowed board loads every page (to the ceiling) so its stated
    // count covers the whole set; the load records whether the ceiling
    // bound it, which the count gate below reads. A failed append stops
    // the load without recording a completion — the gate stays on.
    const loadRest = async (totalPages: number) => {
      const pages = boardPagesToLoad({ saved: depthWanted, totalPages, spanning: span.spanning, windowed: loadWindowed })
      for (let n = 2; n <= pages && !cancelled; n++) {
        const more = await fetchSpan(span.from, span.to, n, true)
        if (!more || cancelled) return
        setPage(n)
      }
      if (!cancelled) setCappedKey(pages < totalPages ? queryKey : null)
    }
    ;(async () => {
      try {
        // Anonymous visitors use the server-rendered day. Signed-in visitors refetch for their own flags.
        if (initialBoard && seedMatches && authStatus !== 'authenticated') {
          setEvents(initialBoard.events)
          setTotal(initialBoard.total)
          setEndedTotal(initialBoard.endedTotal ?? 0)
          setDataCity(initialBoard.city)
          setDataKey(queryKey)
          setTotalPages(initialBoard.totalPages)
          setPage(1)
          setLoading(false)
          await loadRest(initialBoard.totalPages)
          return
        }
        setPage(1)
        const first = await fetchSpan(span.from, span.to, 1, false)
        if (!first || cancelled) return
        await loadRest(first.totalPages)
      } finally {
        release()
      }
    })()
    return () => {
      cancelled = true
      fetchSeq.current += 1
      release()
    }
  }, [span?.from, span?.to, fetchSpan, seedMatches, authStatus, initialBoard, city, queryKey])

  // A retry after a dropped connection re-runs the whole first load —
  // page 1 and every planned page after it — so a windowed board whose
  // appends were stranded mid-load completes its set instead of sitting
  // on the partial rows the page-1 refetch alone brought back.
  const reloadInitial = useCallback(async () => {
    if (!span) return
    topUpSettledRef.current = null
    topUpFailedRef.current = null
    setPage(1)
    const first = await fetchSpan(span.from, span.to, 1, false)
    if (!first) return
    const pages = boardPagesToLoad({ saved: 1, totalPages: first.totalPages, spanning: span.spanning, windowed: loadWindowed })
    for (let n = 2; n <= pages; n++) {
      const more = await fetchSpan(span.from, span.to, n, true)
      if (!more) return
      setPage(n)
    }
    setCappedKey(pages < first.totalPages ? queryKey : null)
  }, [span, fetchSpan, requestedWindow, windowPinned, queryKey])

  useEffect(() => {
    if (!offline || !span) return
    const retry = createReconnectRetry()
    armReconnect(retry, () => { void reloadInitial() })
    return () => retry.stop()
  }, [offline, span, reloadInitial])

  // A window switch can make this board windowed after its first load
  // already ran unwindowed. The plan chips pin 'all' for Today and
  // 'evening' for Tonight over the same day with the same cleared
  // filters, so the span and the board query are identical and the
  // first-load effect above — whose deps are the query, not the
  // window — never re-runs; the filter panel's When choices have the
  // same shape. The held set is then the depth the unwindowed load
  // stopped at, while the count gate reads the board as windowed over
  // that partial set and holds the headline. Top the load up instead:
  // append the remaining planned pages (boardTopUpTarget — the first
  // load's own decision, ceiling included) without refetching page 1
  // or disturbing the rows already held, and record the ceiling the
  // same way the first load does. The guards keep it out of the first
  // load's way: it waits until the held rows are this query's own
  // (dataKey recorded) and no fetch is in flight (a retry's page-1
  // refetch must land first, or the appends would land on the set it
  // is about to replace), and it never runs for a spanning span (the
  // target reads the held depth back). The loop follows the first
  // load's discipline — fetchSpan's sequence guard drops its fetches
  // when a newer query supersedes them, the mirrors abandon it when
  // the query moves on or the board stops being windowed, and a
  // failed append stops it without recording a completion, leaving
  // recovery to the same retry paths as a failed first load. A
  // genuinely failed append also records the query in the failed
  // mark: the effect's deps include the loading flags the failed
  // fetch toggles on its way out, so without the mark it would fire
  // the same attempt again at round-trip rate against a persistently
  // failing endpoint. With it, the headline simply stays gated until
  // a retry path (which clears the mark) reloads the board. A
  // superseded or abandoned append records nothing — its board
  // belongs to a newer fetch, or to no fetch at all.
  const topUpTarget = span
    ? boardTopUpTarget({ heldPages: page, totalPages, spanning: span.spanning, windowed: loadWindowed })
    : page
  useEffect(() => {
    topUpQueryRef.current = queryKey
    topUpWindowedRef.current = loadWindowed
    topUpTotalPagesRef.current = totalPages
    if (!span || span.spanning || authStatus === 'loading' || loading || loadingMore || offline) return
    if (dataKey !== queryKey) return
    if (topUpTarget <= page) return
    if (topUpRunningRef.current || topUpSettledRef.current === queryKey || topUpFailedRef.current === queryKey) return
    topUpRunningRef.current = true
    const target = topUpTarget
    const key = queryKey
    ;(async () => {
      try {
        for (let n = page + 1; n <= target; n++) {
          if (topUpQueryRef.current !== key || !topUpWindowedRef.current) return
          const seqBefore = fetchSeq.current
          const more = await fetchSpan(span.from, span.to, n, true)
          if (!more) {
            if (boardTopUpAppendFailed({ seqBefore, seqNow: fetchSeq.current, stillCurrent: topUpQueryRef.current === key && topUpWindowedRef.current })) {
              topUpFailedRef.current = key
            }
            return
          }
          setPage(n)
        }
        if (topUpQueryRef.current === key) {
          setCappedKey(target < topUpTotalPagesRef.current ? key : null)
          topUpSettledRef.current = key
        }
      } finally {
        topUpRunningRef.current = false
      }
    })()
  }, [span?.from, span?.to, span?.spanning, authStatus, loading, loadingMore, offline, dataKey, queryKey, loadWindowed, topUpTarget, page, totalPages, fetchSpan])

  useEffect(() => { writeListDepth(page) }, [page])

  useEffect(() => {
    if (!activeId) return
    const nodes = document.querySelectorAll<HTMLElement>(`[data-event-id="${CSS.escape(activeId)}"]`)
    const visible = [...nodes].find((el) => el.getClientRects().length > 0)
    visible?.scrollIntoView({ block: 'center' })
  }, [activeId])

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
    if (countFor(listed, requestedWindow) > 0) return requestedWindow
    if (countFor(listed, 'evening') > 0) return 'evening'
    if (countFor(listed, 'all') > 0) return 'all'
    return requestedWindow
  }, [span?.spanning, windowPinned, loading, requestedWindow, listed, nowMinutes])

  useEffect(() => {
    if (span?.spanning) return
    if (!windowPinned && !loading && effectiveWindow !== timeWindow) onWindowChange?.(effectiveWindow)
  }, [span?.spanning, windowPinned, loading, effectiveWindow, timeWindow, onWindowChange])

  const { timed, untimed } = useMemo(() => {
    const t: { ev: BoardEvent; status: ReturnType<typeof getStatus>; start: number; date: string }[] = []
    const u: BoardEvent[] = []
    if (!span) return { timed: t, untimed: u }
    for (const ev of listed) {
      const date = String(ev.date).slice(0, 10)
      const rowDay = span.spanning ? date : (day ?? span.from)
      const sched = resolveSchedule(ev, rowDay)
      const status = getStatus(ev, rowDay, today, nowMinutes)
      // No clock, or a midnight-to-late guide time: not a morning session on a single day.
      if (sched.start === null) {
        if (!(hideEnded && status.tone === 'done')) u.push(ev)
        continue
      }
      if (sched.dropIn) {
        if (hideEnded && status.tone === 'done') continue
        if (span.spanning) t.push({ ev, status, start: sched.start, date })
        else if (effectiveWindow === 'all') u.push(ev)
        continue
      }
      const start = sched.start
      if (effectiveWindow === 'hour' && !(start >= nowMinutes && start - nowMinutes <= 60)) continue
      if (effectiveWindow === 'evening' && start < 17 * 60) continue
      if (hideEnded && status.tone === 'done') continue
      t.push({ ev, status, start, date })
    }
    return { timed: t, untimed: u }
  }, [listed, day, span, today, nowMinutes, effectiveWindow, hideEnded])

  const windowRank = useMemo(() => {
    if (!span || span.spanning || (effectiveWindow !== 'now' && effectiveWindow !== 'evening')) return null
    const dayKey = day ?? span.from
    return rankBoard(listed, {
      window: effectiveWindow === 'evening' ? 'tonight' : 'now',
      day: dayKey,
      nowMinutes,
      dropEnded: !!today && dayKey === today && hideEnded,
    })
  }, [listed, day, span, today, nowMinutes, effectiveWindow, hideEnded])

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
    ? (() => {
      const horizon = nowMinutes + 12 * 60
      const dayKey = day ?? ''
      // The re-admission reads the start the same way rankBoard does —
      // through resolveSchedule, which derives a start from startsAt
      // when the listing carries no clock string. Reading ev.time alone
      // silently dropped that whole storage shape from this band: a
      // startsAt-only listing starting more than three hours out was in
      // no 'now' section at all, though the full-day board renders it
      // with its derived clock. (Drop-ins stay out: they belong to the
      // All day section, and a midnight-placeholder start of 0 would
      // otherwise double-count one at the day's first minute.)
      const upcoming = listed.filter((ev) => {
        if (!dayKey || String(ev.date).slice(0, 10) !== dayKey) return false
        const sched = resolveSchedule(ev, dayKey)
        if (sched.dropIn || sched.start == null) return false
        return sched.start >= nowMinutes && sched.start <= horizon
      })
      const seen = new Set<string>()
      const coming = [...windowRank.soon, ...upcoming].filter((ev) => {
        if (seen.has(ev.id)) return false
        seen.add(ev.id)
        return true
      }).sort((a, b) => (resolveSchedule(a, dayKey).start ?? 0) - (resolveSchedule(b, dayKey).start ?? 0))
      const happening = [...windowRank.lead, ...windowRank.still].filter((ev) => !seen.has(ev.id))
      return [
        { key: 'next', label: 'Coming up', rows: coming.map(rowFor), possibly: false },
        { key: 'on', label: 'Happening now', rows: happening.map(rowFor), possibly: false },
        { key: 'allday', label: 'All day', rows: windowRank.allday.map(rowFor), possibly: false },
        { key: 'possibly', label: 'Time not listed', rows: windowRank.possibly.map(rowFor), possibly: true },
      ].filter((section) => section.rows.length)
    })()
    : []

  // The summary count derives from the same set as the listed rows. In a
  // time window it counts the rendered sections themselves — the 'now'
  // sections re-admit rows rankBoard set aside, so the bucket sums and
  // the rendered rows can differ (E2E-17: "5 events" over 8 visible
  // rows). In the 'hour' window there is no windowRank, so the count is
  // the hour-filtered rows themselves (timed is already cut to the hour
  // in the memo above). Unwindowed, it is the board query's total — the
  // full shaped set for these filters — less the ended rows in that
  // same server set while they are hidden, so the stated count equals
  // the rows the visitor can scroll to at any page depth.
  // A windowed count is a sum over the held rows, so it may only be
  // published once the first load has fetched every page of the span —
  // until then it would be a partial sum that grows as the appends land.
  // The gate holds the summary on its loading treatment and reports 0
  // to the parent, exactly as a stale query does. When the first load's
  // page ceiling bound the load, the held set can never complete, and
  // the headline falls back to the server's full-set numbers for the
  // span rather than ever publishing the partial sum.
  // The gate and the full load apply to the collapsed preview board
  // too: its summary line is the same count line (on the homepage it is
  // the site's main one), so it loads the whole set and holds "…"
  // until the set lands. #308 exempted previews from both, and its
  // post-release check caught the landing headline settled on page 1's
  // partial sum (296) while the open board stated the full windowed
  // count (373).
  // The gate and the load take their `windowed` from the same
  // decision (boardLoadIsWindowed): the requested window, or any
  // window at all when unpinned — an unpinned board's effective
  // window is picked by the fallback chain above once rows land, and
  // can land on 'evening' over an 'all' request. Reading the load
  // from the request alone left that promotion gated over a
  // depth-loaded set, with no load left to release it.
  const countGate = boardCountGate({
    windowed: !span?.spanning && loadWindowed,
    heldPages: page,
    totalPages,
    capped: cappedKey !== null && cappedKey === queryKey,
  })
  const countGated = countGate === 'gated'
  const listedCount = countGate === 'fallback'
    ? hideEnded ? total - endedTotal : total
    : windowRank
      ? effectiveWindow === 'now'
        ? nowSections.reduce((n, section) => n + section.rows.length, 0)
        : eveningGroups.reduce((n, group) => n + group.rows.length, 0) + windowRank.possibly.length
      : effectiveWindow === 'hour'
        ? timed.length + untimed.length
        : hideEnded ? total - endedTotal : total
  useEffect(() => { onListedCount?.(staleCity || staleQuery || countGated ? 0 : listedCount) }, [listedCount, staleCity, staleQuery, countGated, onListedCount])
  const previewFlat = previewLimit == null ? null : (() => {
    const rows: { ev: BoardEvent; status?: Status; showDate?: string }[] = []
    const push = (list: { ev: BoardEvent; status?: Status; showDate?: string }[]) => {
      for (const row of list) {
        if (railSkip.has(row.ev.id)) continue
        if (rows.length < previewLimit) rows.push(row)
      }
    }
    if (span?.spanning) push(timed.map((row) => ({ ...row, showDate: dayLabel(row.date, today) })))
    else if (windowRank && effectiveWindow === 'now') nowSections.forEach((section) => push(section.rows.map(({ ev }) => ({ ev }))))
    else if (windowRank) {
      eveningGroups.forEach((group) => push(group.rows))
      push(windowRank.possibly.map((ev) => ({ ev, status: { label: 'Time not listed', tone: 'tbc' as const } })))
    } else groups.forEach((group) => push(group.rows))
    return rows
  })()
  let previewLeft = previewLimit ?? Number.POSITIVE_INFINITY
  const take = <T,>(rows: T[]): T[] => {
    if (!Number.isFinite(previewLeft)) return rows
    const next = rows.slice(0, previewLeft)
    previewLeft -= next.length
    return next
  }

  const showRows = (rows: { ev: BoardEvent; status?: Status; showDate?: string }[]) => {
    if (layout !== 'board') {
      return rows.map(({ ev, status, showDate }) => (
        <BoardRow key={ev.id} ev={ev} status={status ?? getStatus(ev, day ?? String(ev.date).slice(0, 10), today, nowMinutes)} saved={isSaved(ev.id)} onToggleSave={toggle} showDate={showDate} trackSearch={!!searchQuery} active={activeId === ev.id} />
      ))
    }
    return (
      <div className="vp-board-grid">
        {rows.map(({ ev }) => {
          const catName = parentCategory(ev.category) || ev.category
          const cat = CATEGORIES.find((item) => item.name === catName)
          const price = listPriceLabel(ev.isFree, ev.price, ev.priceMin, ev.priceMax)
          const when = formatBoardRange(ev)
          const place = listPlaceLine(
            [tidyVenueName(ev.venueName, ev.venueAddress, ev.city), displaySuburb(ev.suburb, ev.venueAddress, ev.city)].filter(Boolean).join(' · '),
            when.endNote,
          )
          const Icon = categoryIcon(catName)
          return (
            <ListingBoardCard
              key={ev.id}
              title={displayTitle(ev.title)}
              href={ev.href ?? eventPath(ev)}
              imageUrl={ev.imageUrl}
              imageCategory={ev.category}
              imageWidth={ev.imageWidth}
              imageHeight={ev.imageHeight}
              imageColor={ev.imageColor}
              imageBlur={ev.imageBlur}
              imageDisplay={ev.imageDisplay}
              venue={place}
              tag={catName}
              accent={cat?.color ?? '#FF7A35'}
              priceText={price.text}
              priceKind={price.kind}
              priceNote={priceFeeNote(price.kind)}
              when={when}
              icon={Icon}
              actions={(
                <>
                  <SaveButton saved={isSaved(ev.id)} onClick={() => toggle(ev)} label={isSaved(ev.id) ? 'Remove from saved' : 'Save event'} className={cn('relative z-20 rounded-md bg-transparent p-0', isSaved(ev.id) ? 'text-primary' : 'text-muted-foreground')} />
                  <ItineraryButton lineup event={ev} className="relative z-20 grid h-11 w-11 place-items-center rounded-md p-0" />
                </>
              )}
            />
          )
        })}
      </div>
    )
  }

  const firstLoad = (loading && events.length === 0) || staleCity || staleQuery
  // The summary names the selected area group when one is picked (e.g.
  // 'Newcastle & the Hunter' on the Sydney board), else the board city's
  // display name (the NSW Coast region on the Sydney board).
  const selectedArea = city ? areaGroupFor(city, filters.suburb) : undefined
  const placeName = selectedArea ? selectedArea.label : city ? boardDisplayName(city) : 'Australia'
  return (
    <div>
      <ReachBeacon surface={searchQuery ? 'search' : 'board'} ids={events.map((event) => event.id)} term={searchQuery} />
      {/* Summary row */}
      {offline && events.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2 text-sm sm:px-5" role="status">
          <p>The connection dropped. Showing the last list we loaded.</p>
          <button type="button" onClick={() => { void reloadInitial() }} className="font-semibold text-primary">Try again</button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-5 py-2.5 border-b border-border text-sm text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-free" />
        <span className="font-semibold text-foreground">{firstLoad || countGated ? '…' : listedCount}</span> {listedCount === 1 ? 'event' : 'events'} in {placeName}{effectiveWindow === 'evening' || effectiveWindow === 'now' ? ' tonight' : ''}
        {span?.spanning && !loading && !staleCity && !staleQuery && <span>· {dayLabel(span.from, today)} – {dayLabel(span.to, today)}</span>}
        {!loading && !staleCity && !staleQuery && !countGated && untimed.length > 0 && <span>· {untimed.length} all-day</span>}
        {isToday && !staleCity && !staleQuery && endedTotal > 0 && effectiveWindow !== 'now' && effectiveWindow !== 'hour' && (
          <label className="ml-2 inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} className="w-4 h-4 accent-[hsl(var(--primary))]" />
            Show ended ({endedTotal})
          </label>
        )}
      </div>

      {layout === 'list' && <BoardHeadings />}

      {firstLoad ? (
        <div aria-busy="true" aria-label="Loading events">
          <div className="flex flex-col items-center justify-center gap-2 py-8" aria-live="polite">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Having a peep…</p>
          </div>
          <div className="xl:hidden">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="vp-mrow pointer-events-none" aria-hidden>
                <span className="vp-mrow-rail"><span className="vp-mrow-dot" /></span>
                <span className="vp-mrow-start"><span className="inline-block h-3 w-12 rounded bg-muted animate-pulse" /></span>
                <span className="vp-mrow-line1"><span className="inline-block h-3 w-2/3 rounded bg-muted animate-pulse" /></span>
                <span className="vp-mrow-venue"><span className="inline-block h-3 w-1/2 rounded bg-muted animate-pulse" /></span>
                <span className="vp-mrow-meta"><span className="inline-block h-3 w-16 rounded-full bg-muted animate-pulse" /></span>
                <span className="vp-mrow-actions" />
              </div>
            ))}
          </div>
          <div className="hidden divide-y divide-border xl:block">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex gap-4 px-5 py-4">
                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : offline && events.length === 0 ? (
        <PeepEmpty title="The signal dropped." body="We couldn't reach the list. The page is fine. Try again when you're back online." action={(
          <button type="button" onClick={() => { void reloadInitial() }} className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">Try again</button>
        )} />
      ) : previewFlat ? (
        previewFlat.length ? showRows(previewFlat) : (
          <PeepEmpty title="Crickets. I checked twice." body="Nothing else in this window. Open the full list or loosen a filter." />
        )
      ) : span?.spanning && timed.length === 0 ? (
        <PeepEmpty title="Crickets. I checked twice." body="Nothing in that date range. Widen the dates or loosen your filters." />
      ) : span?.spanning ? (
        [...timed.reduce((map, row) => map.set(row.date, [...(map.get(row.date) ?? []), row]), new Map<string, typeof timed>())].map(([date, rows]) => (
          <section key={date}>
            <GroupBar label={dayLabel(date, today)} count={rows.length} open={!closed[date]} onToggle={() => setClosed((c) => ({ ...c, [date]: !c[date] }))} />
            {!closed[date] && showRows(take(rows.map((row) => ({ ...row, showDate: dayLabel(date, today) }))))}
          </section>
        ))
      ) : windowRank ? (
        <>
          {(effectiveWindow === 'now' ? nowSections.length === 0 : eveningGroups.length === 0 && windowRank.possibly.length === 0) ? (
            <PeepEmpty
              title="Crickets. I checked twice."
              body="Nothing listed tonight yet. Try this weekend."
              action={onWindowChange ? (
                <button onClick={() => onWindowChange('all')} className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">Show the Full Day</button>
              ) : null}
            />
          ) : effectiveWindow === 'now' ? nowSections.map((section) => {
            const open = !closed[section.key]
            return (
              <section key={section.key}>
                <GroupBar label={section.label} count={section.rows.length} open={open} onToggle={() => setClosed((c) => ({ ...c, [section.key]: open }))} />
                {open && showRows(take(section.rows.map(({ ev }) => ({ ev, status: section.possibly ? { label: 'Time not listed', tone: 'tbc' as const } : getStatus(ev, day ?? String(ev.date).slice(0, 10), today, nowMinutes) }))))}
              </section>
            )
          }) : eveningGroups.map((g) => {
            const open = !closed[g.key]
            return (
              <section key={g.key}>
                <GroupBar label={g.label} count={g.rows.length} open={open} onToggle={() => setClosed((c) => ({ ...c, [g.key]: open }))} />
                {open && showRows(take(g.rows))}
              </section>
            )
          })}
          {effectiveWindow === 'evening' && windowRank.possibly.length > 0 && (
            <section>
              <GroupBar label="Time not listed" count={windowRank.possibly.length} open={!closed.possibly} onToggle={() => setClosed((c) => ({ ...c, possibly: !c.possibly }))} />
              {!closed.possibly && showRows(take(windowRank.possibly.map((ev) => ({ ev, status: { label: 'Time not listed', tone: 'tbc' as const } }))))}
            </section>
          )}
        </>
      ) : groups.length === 0 ? (
        <PeepEmpty
          title="Crickets. I checked twice."
          body={effectiveWindow !== 'all' ? 'Nothing in this window. Hit “Full day”, pick another date or loosen your filters.' : 'Try widening the dates: pick another date or loosen your filters.'}
          action={effectiveWindow !== 'all' && onWindowChange ? (
            <button onClick={() => onWindowChange('all')} className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">Show the Full Day</button>
          ) : null}
        />
      ) : (
        groups.map((g) => {
          const open = !closed[g.key]
          return (
            <section key={g.key}>
              <GroupBar label={g.label} count={g.rows.length} open={open} onToggle={() => setClosed((c) => ({ ...c, [g.key]: open }))} />
              {open && showRows(take(g.rows))}
            </section>
          )
        })
      )}

      {!loading && !staleCity && !staleQuery && previewLimit == null && page < totalPages && span && (
        <div className="flex justify-center py-5 border-t border-border">
          <button
            onClick={async () => { const n = page + 1; const more = await fetchSpan(span.from, span.to, n, true); if (more) setPage(n) }}
            disabled={loadingMore}
            className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            Show {Math.max(total - events.length, 0)} More
          </button>
        </div>
      )}

      {/* All-day / untimed */}
      {!loading && !staleCity && !staleQuery && !windowRank && untimed.length > 0 && (
        <div className="border-t border-border">
          <button onClick={() => setAllDayOpen((o) => !o)} className="w-full flex items-center gap-3 px-3 sm:px-5 py-3.5 text-left hover:bg-muted/50" aria-expanded={allDayOpen}>
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Also on {day ? dayLabel(day, today).toLowerCase() : 'today'} · exhibitions, markets & all-day events</span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">{untimed.length}</span>
            <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform', allDayOpen && 'rotate-90')} />
          </button>
          {allDayOpen && day && showRows(take(untimed.map((ev) => ({ ev, status: getStatus(ev, day, today, nowMinutes) }))))}
        </div>
      )}
    </div>
  )
}

function PeepEmpty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="mb-1 font-semibold">{title}</p>
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  )
}
