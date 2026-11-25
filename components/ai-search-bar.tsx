'use client'

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, CalendarDays, CalendarRange, MapPin, Search, SlidersHorizontal } from 'lucide-react'
import { categoryIcon, dayLabel } from '@/lib/board'
import { COPY } from '@/lib/copy'
import { formatTime } from '@/lib/format'
import { matchPlanPick, PLAN_PICKS, type PlanPick, type PlanView } from '@/lib/plan-picks'
import { eventPath } from '@/lib/seo'
import { chipQuery, EMPTY_HINTS, hintsToQuery, isNaturalAsk, pickedHints, type SearchHints } from '@/lib/search-hints'
import { isLgbtiTerm } from '@/lib/search-fold'
import { Button } from '@/components/ui/button'
import { Chip, ChipGroup } from '@/components/ui/chip'
import { IconButton } from '@/components/ui/icon-button'
import { FilterPicks } from '@/components/filter-picks'
import { PlanCard } from '@/components/plan-card'
import { SearchBar } from '@/components/search-bar'
export interface AiSearchFilters {
  dateFrom: string; dateTo: string; category: string; isFree: boolean; maxPrice: number | null
  lgbtiq: boolean; timeOfDay: 'morning' | 'afternoon' | 'evening' | 'any'; suburb: string; subTag?: string; paidOnly?: boolean; keywords: string[]; soon: boolean; city?: string; nearMe?: boolean
}
type Hints = SearchHints
const NO_HINTS: Hints = EMPTY_HINTS
interface AiResult { id: string; title: string; date: string; time: string | null; venueName: string; suburb: string | null; city: string; category: string; isFree: boolean; price: string | null }
interface AiResponse { filters: AiSearchFilters; ai: boolean; relaxed: boolean; total: number; results: AiResult[] }

const PLAN_SUGGESTIONS = ['Saturday date night', 'Family Sunday', 'Free afternoon', 'Family day out']
const SEARCH_SUGGESTIONS = ['Live music', 'Comedy under $40', 'LGBTIQ+ this week']

function understood(f: AiSearchFilters, today: string | null): string[] {
  const when = f.dateFrom === f.dateTo ? dayLabel(f.dateFrom, today) : `${dayLabel(f.dateFrom, today)} – ${dayLabel(f.dateTo, today)}`
  return [
    f.soon ? 'Next 3 hours' : when,
    f.timeOfDay !== 'any' ? f.timeOfDay[0].toUpperCase() + f.timeOfDay.slice(1) : '',
    f.category,
    f.isFree ? 'Free' : f.maxPrice ? `Under $${f.maxPrice}` : '',
    f.lgbtiq ? 'LGBTIQ+' : '',
    f.city || '',
    f.suburb ? `Near ${f.suburb}` : '',
    ...f.keywords.filter((word) => !(f.lgbtiq && isLgbtiTerm(word))).map((k) => `“${k}”`),
  ].filter(Boolean)
}

/** Hero search and the Ask sheet. A plan-shaped ask shows a ready-made outing. */
export function AiSearchBar({ city, today, onShowAll, onResult, placeholder, queryRequest, chips = true, inputId = 'ai-search', goToPage = false }: { city: string; today: string | null; onShowAll: (f: AiSearchFilters) => void; onResult?: () => void; placeholder?: string; queryRequest?: { id: number; text: string; hints?: Hints } | null; chips?: boolean; inputId?: string; goToPage?: boolean }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<AiResponse | null>(null)
  const [hints, setHints] = useState<Hints>(NO_HINTS)
  const [open, setOpen] = useState(false)
  const [planBusy, setPlanBusy] = useState(false)
  const [planError, setPlanError] = useState('')
  const [plan, setPlan] = useState<PlanView | null>(null)
  const [planHistory, setPlanHistory] = useState<PlanView[]>([])
  const [planFallback, setPlanFallback] = useState('')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const skipOpen = useRef(false)
  const reqId = useRef(0)
  const planReq = useRef(0)
  const loadedSlug = useRef<string | null>(null)
  const asked = useRef(0)
  const hasHints = pickedHints(hints)
  const hintCount = [hints.when, hints.budget, hints.category, hints.area.trim()].filter(Boolean).length
  const working = planBusy || busy
  const planReady = !!plan?.stops.some((stop) => stop.kind === 'event')

  const loadPlan = async (pick: PlanPick): Promise<'ready' | 'empty' | 'error' | 'stale'> => {
    const id = ++planReq.current
    loadedSlug.current = pick.slug
    setPlanBusy(true)
    setPlanError('')
    setError('')
    try {
      const params = new URLSearchParams({ slug: pick.slug, city: city || 'Sydney' })
      const res = await fetch(`/api/outings?${params}`)
      const body = await res.json().catch(() => ({}))
      if (id !== planReq.current) return 'stale'
      const view = body?.plan as PlanView | undefined
      const live = !!view?.stops.some((stop) => stop.kind === 'event')
      if (!res.ok || !view) {
        setPlan(null)
        setPlanError(typeof body?.error === 'string' ? body.error : 'The planner’s having a moment. Give it another go.')
        return 'error'
      }
      if (!live) {
        setPlan(null)
        return 'empty'
      }
      setPlan(view)
      setPlanHistory([])
      setData(null)
      setPlanFallback('')
      return 'ready'
    } catch (err) {
      console.error(err)
      if (id !== planReq.current) return 'stale'
      setPlan(null)
      setPlanError('The planner’s having a moment. Give it another go.')
      return 'error'
    } finally {
      if (id === planReq.current) setPlanBusy(false)
    }
  }

  const search = async (query: string, h: Hints = hints, closeOnSend = false, coords?: { lat: number; lng: number }, extra?: { maxPrice?: number; subTag?: string }) => {
    const text = query.trim()
    const picked = pickedHints(h)
    if (text.length < 2 && !picked) {
      setError('Tell us what you feel like doing, e.g. “jazz on Friday night”, or pick a time, budget or idea.')
      setOpen(true)
      inputRef.current?.focus()
      return
    }
    if (closeOnSend) setOpen(false)
    const pick = matchPlanPick(text)
    if (pick) {
      setQ(text)
      const outcome = await loadPlan(pick)
      if (outcome === 'ready' || outcome === 'stale' || outcome === 'error') return
      setPlanFallback('That plan’s a bit quiet on the board, so here’s a straight look instead.')
    } else {
      setPlan(null)
      setPlanFallback('')
      loadedSlug.current = null
    }
    const id = ++reqId.current
    setQ(text); setBusy(true); setError('')
    try {
      const res = await fetch('/api/ai-search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: text.length >= 2 ? text : '', city, hints: h, ...(extra?.maxPrice ? { maxPrice: extra.maxPrice } : {}), ...(extra?.subTag ? { subTag: extra.subTag } : {}), ...(coords ?? {}) }) })
      if (id !== reqId.current) return
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d?.error ?? 'Can’t search just now. Give it another go in a tick.'); setData(null); return }
      if (d?.needsLocation && !coords) {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          setError('Allow location for “near me”, or name a city or suburb. We won’t guess from the board city.')
          setData({ ...d, results: [], total: 0, needsLocation: false })
          return
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => { if (id === reqId.current) void search(text, h, false, { lat: pos.coords.latitude, lng: pos.coords.longitude }) },
          () => {
            if (id !== reqId.current) return
            setError('Allow location for “near me”, or name a city or suburb. We won’t guess from the board city.')
            setData({ ...d, results: [], total: 0 })
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
        )
        return
      }
      setData(d)
    } catch (err) {
      console.error(err); setError('Ask’s having a moment. Give it another go.'); setData(null)
    } finally { if (id === reqId.current) setBusy(false) }
  }

  const clearBar = () => {
    setQ('')
    setData(null)
    setError('')
    setPlan(null)
    setPlanHistory([])
    setPlanFallback('')
    setPlanError('')
    loadedSlug.current = null
    planReq.current += 1
    setPlanBusy(false)
    inputRef.current?.focus()
  }

  // Quick picks refine the search live. Query text waits for Ask VibePeep, so it is not a dependency.
  const hintsKey = JSON.stringify(hints)
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    if (!hasHints && !data) return
    if (!hasHints && q.trim().length < 2) return
    const t = setTimeout(() => search(q, hints), 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-search only when picks or city change
  }, [hintsKey, city])

  useEffect(() => {
    if (!queryRequest || queryRequest.id === asked.current) return
    asked.current = queryRequest.id
    const nextHints = queryRequest.hints ?? NO_HINTS
    setQ(queryRequest.text)
    setHints(nextHints)
    void search(queryRequest.text, nextHints, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when a new prompt is requested
  }, [queryRequest])

  // A plan already on screen follows the city select.
  useEffect(() => {
    if (!loadedSlug.current) return
    const pick = PLAN_PICKS.find((item) => item.slug === loadedSlug.current)
    if (pick) void search(pick.fill, NO_HINTS, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the city changes
  }, [city])

  useEffect(() => {
    if (!open) return
    const inside = (node: EventTarget | null) => !!node && !!rootRef.current?.contains(node as Node)
    let pointerDown = false
    const onPointerDown = () => { pointerDown = true }
    const onPointerUp = () => { pointerDown = false }
    // Click closes after the thing they pressed has already handled the event, so the panel
    // collapsing does not steal that click. Keyboard focus leaving the bar closes immediately.
    const onClick = (e: Event) => { if (!inside(e.target)) setOpen(false) }
    const onFocusIn = (e: FocusEvent) => { if (!pointerDown && !inside(e.target)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
      const input = inputRef.current
      if (input && document.activeElement !== input) {
        skipOpen.current = true
        input.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('click', onClick)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('click', onClick)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const reveal = () => {
    if (skipOpen.current) skipOpen.current = false
  }
  const focusPanel = () => {
    setOpen(true)
    setTimeout(() => panelRef.current?.querySelector<HTMLElement>('button, select, input')?.focus(), 0)
  }
  const clearHints = () => {
    setHints(NO_HINTS)
    if (q.trim().length < 2) setData(null)
  }
  const keepFocus = (e: MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('input, select, textarea')) return
    e.preventDefault()
  }

  const rememberPlan = (next: PlanView | null) => {
    if (plan) setPlanHistory((history) => [...history.slice(-9), plan])
    setPlan(next)
  }

  const editPlan = async (action: 'swap' | 'add' | 'shuffle' | 'remove', replaceId?: string) => {
    if (!plan) return
    const eventIds = plan.stops.flatMap((stop) => (stop.kind === 'event' ? [stop.event.id] : []))
    setPlanBusy(true)
    setPlanError('')
    try {
      const res = await fetch('/api/outings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: plan.slug, city: plan.city || city, action, eventIds, replaceId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.plan) {
        setPlanError(typeof body?.error === 'string' ? body.error : 'Nothing else fits that slot.')
        return
      }
      rememberPlan(body.plan as PlanView)
    } catch (err) {
      console.error(err)
      setPlanError('The planner’s having a moment. Give it another go.')
    } finally {
      setPlanBusy(false)
    }
  }

  const undoPlan = () => {
    const previous = planHistory[planHistory.length - 1]
    if (!previous) return
    setPlan(previous)
    setPlanHistory((history) => history.slice(0, -1))
  }

  const submitBar = (event: FormEvent<HTMLFormElement>) => {
    const text = q.trim()
    if (goToPage) {
      if (!text && !hasHints) {
        event.preventDefault()
        setError('Tell us what you feel like doing, or pick a time, budget or idea.')
        inputRef.current?.focus()
        return
      }
      if (text && isNaturalAsk(text)) {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('vp-open-ask', { detail: { q: text, hints } }))
        return
      }
      event.preventDefault()
      router.push(`/search?${hintsToQuery(hints, { q: text, city })}`)
      return
    }
    event.preventDefault()
    void search(q, hints, true)
  }

  const runSuggestion = (label: string) => {
    const mapped = chipQuery(label)
    if (!mapped) {
      void search(label, hints, true)
      return
    }
    const next = { ...hints, when: mapped.hints.when ?? hints.when, budget: mapped.hints.budget ?? hints.budget, category: mapped.hints.category ?? hints.category, area: mapped.hints.area ?? hints.area }
    setHints(next)
    void search(mapped.q, next, true, undefined, { maxPrice: mapped.maxPrice, subTag: mapped.subTag })
  }

  const errorEl = error
    ? <p role="alert" className={open ? 'mb-3 text-sm font-medium text-red-700' : 'mt-hero rounded-card border border-border bg-card p-card text-sm font-medium text-foreground'}>{error}</p>
    : null

  return (
    <div className="flex-1 min-w-0">
      <div ref={rootRef} className="overflow-hidden rounded-hero bg-white text-[var(--vp-on-light)] shadow-vp-md ring-2 ring-primary/50 focus-within:ring-primary">
        <p id={`${inputId}-help`} className="sr-only">Tell us your vibe, or open filters for time, budget, suburb and suggestions.</p>
        <SearchBar
          ref={inputRef}
          id={inputId}
          embedded
          icon="spark"
          name={goToPage ? 'q' : undefined}
          action={goToPage ? '/search' : undefined}
          value={q}
          onChange={setQ}
          onSubmit={submitBar}
          placeholder={placeholder ?? 'Ask for a vibe'}
          label="Tell us your vibe"
          busy={working}
          describedBy={`${inputId}-help`}
          onFocus={reveal}
          onClick={reveal}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown') return
            event.preventDefault()
            focusPanel()
          }}
          onClear={q && !working ? clearBar : undefined}
          hidden={goToPage ? [
            { name: 'city', value: city },
            { name: 'when', value: hints.when },
            { name: 'budget', value: hints.budget },
            { name: 'vibe', value: hints.category },
            { name: 'suburb', value: hints.area },
          ] : undefined}
          trailing={(
            <IconButton
              type="button"
              variant="ghost"
              aria-expanded={open}
              aria-controls={`${inputId}-panel`}
              label={hintCount ? `Filters, ${hintCount} on` : 'Filters'}
              onClick={() => setOpen((v) => !v)}
              className={open ? 'relative bg-primary/15 text-primary' : 'relative text-[var(--vp-on-light)]'}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              {hintCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-xs font-bold leading-none text-on-primary" aria-hidden>{hintCount}</span>
              )}
            </IconButton>
          )}
        />

        {chips && (
          <div className="grid gap-4 px-3 pb-3 pt-3">
            <ChipGroup onLight label="Plan my..." icon={<CalendarRange className="h-3.5 w-3.5" aria-hidden />}>
              {PLAN_SUGGESTIONS.map((s) => (
                <Chip key={s} onLight type="button" onClick={() => runSuggestion(s)} disabled={busy}>{s}</Chip>
              ))}
            </ChipGroup>
            <ChipGroup onLight label="Search" icon={<Search className="h-3.5 w-3.5" aria-hidden />}>
              {SEARCH_SUGGESTIONS.map((s) => (
                <Chip key={s} onLight type="button" onClick={() => runSuggestion(s)} disabled={busy}>{s}</Chip>
              ))}
            </ChipGroup>
          </div>
        )}

        {open && (
          <div
            id={`${inputId}-panel`}
            ref={panelRef}
            role="region"
            aria-label="Filters"
            onMouseDown={keepFocus}
            className="px-3 pb-3 sm:max-h-[min(28rem,70vh)] sm:overflow-y-auto overscroll-contain"
          >
            {errorEl}
            <FilterPicks
              idPrefix={inputId}
              hints={hints}
              onChange={(next) => {
                setHints(next)
                if (!pickedHints(next) && q.trim().length < 2) setData(null)
              }}
              onClear={clearHints}
            />
          </div>
        )}
      </div>

      {!open && errorEl}

      {planError && <p role="alert" className="mt-hero text-sm font-medium text-destructive">{planError}</p>}

      {planBusy && !plan && (
        <p className="mt-hero text-sm text-foreground" aria-live="polite">Stitching the stops together…</p>
      )}

      {planReady && plan && (
        <PlanCard
          plan={plan}
          today={today}
          busy={planBusy}
          canUndo={planHistory.length > 0}
          onSwap={(id) => { void editPlan('swap', id) }}
          onAdd={() => { void editPlan('add') }}
          onShuffle={() => { void editPlan('shuffle') }}
          onRemove={(id) => { void editPlan('remove', id) }}
          onUndo={undoPlan}
        />
      )}

      {busy && !data && !planReady && (
        <p className="mt-hero text-sm text-foreground" aria-live="polite">Having a peep…</p>
      )}

      {data && !planReady && (
        <div className="mt-hero min-w-0 overflow-hidden rounded-card border border-border bg-card p-card text-card-foreground shadow-vp-sm" aria-live="polite">
          {planFallback && <p className="mb-3 text-sm text-foreground">{planFallback}</p>}
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-foreground">{data.ai ? 'Got it:' : 'Searching for:'}</span>
            {understood(data.filters, today).map((c) => (
              <span key={c} title={c} className="inline-flex h-11 max-w-full min-w-0 items-center rounded-full bg-muted px-3.5 text-sm font-semibold text-foreground">
                <span className="truncate">{c}</span>
              </span>
            ))}
          </div>
          {data.relaxed && <p className="mt-2 text-sm text-muted-foreground">Couldn’t nail every word, but these tick most of your boxes.</p>}

          {data.results.length ? (
            <ul className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.results.map((e) => {
                const Icon = categoryIcon(e.category)
                const clock = formatTime(e.time)
                const place = `${e.venueName}${e.suburb ? `, ${e.suburb}` : ''}`
                return (
                  <li key={e.id} className="min-w-0">
                    <Link
                      href={eventPath(e)}
                      onClick={() => onResult?.()}
                      className="group grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] gap-3 overflow-hidden rounded-control border border-border bg-background p-3 text-foreground hover:bg-muted"
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-primary/15 text-primary"><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="block min-w-0 font-semibold leading-snug line-clamp-2 group-hover:underline">{e.title}</span>
                        <span className="mt-1 flex min-w-0 items-center gap-1 text-sm text-foreground"><CalendarDays className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{dayLabel(e.date, today)}{clock ? ` · ${clock}` : ''}</span></span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-sm text-foreground"><MapPin className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{place}</span></span>
                        {e.isFree && <span className="mt-1 inline-flex rounded-full bg-emerald-800 px-2 py-0.5 text-xs font-semibold text-white">Free</span>}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-foreground">I had a proper look. Nothing on VibePeep matches that{(data.filters.city || city) && !data.filters.nearMe ? ` in ${data.filters.city || city}` : ''}. Try a city, a date, or a different kind of event.</p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Real events only. We read your ask. We don’t invent listings.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="md" onClick={() => { reqId.current++; planReq.current += 1; setBusy(false); setPlanBusy(false); setData(null); setPlan(null); setPlanHistory([]); setQ(''); setHints(NO_HINTS); setError(''); setPlanError(''); inputRef.current?.focus() }}>{COPY.startFresh}</Button>
              {data.total > 0 && (
                <Button type="button" variant="outline" size="md" onClick={() => onShowAll(data.filters)}>
                  {data.total > data.results.length ? `See all ${data.total} on the board` : 'Open on the board'}<ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
