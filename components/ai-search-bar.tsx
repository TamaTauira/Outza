'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, CalendarRange, ChevronDown, Loader2, MapPin, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { categoryIcon, dayLabel } from '@/lib/board'
import { formatTime } from '@/lib/format'
import { CATEGORIES } from '@/lib/categories'
import { matchPlanPick, PLAN_PICKS, type PlanPick, type PlanView } from '@/lib/plan-picks'
import { eventPath } from '@/lib/seo'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip, ChipGroup } from '@/components/ui/chip'
import { IconButton } from '@/components/ui/icon-button'
import { PlanCard } from '@/components/plan-card'
import { isLgbtiTerm } from '@/lib/search-fold'
export interface AiSearchFilters {
  dateFrom: string; dateTo: string; category: string; isFree: boolean; maxPrice: number | null
  lgbtiq: boolean; timeOfDay: 'morning' | 'afternoon' | 'evening' | 'any'; suburb: string; subTag?: string; paidOnly?: boolean; keywords: string[]; soon: boolean; city?: string; nearMe?: boolean
}
type When = '' | 'soon' | 'tonight' | 'weekend'
type Budget = '' | 'free' | '30' | '75'
interface Hints { when: When; budget: Budget; category: string; area: string }
const NO_HINTS: Hints = { when: '', budget: '', category: '', area: '' }
const WHEN_OPTS: { key: Exclude<When, ''>; label: string; hint: string }[] = [
  { key: 'soon', label: 'Soon', hint: 'Starting in the next 3 hours' },
  { key: 'tonight', label: 'Tonight', hint: 'From 5pm today' },
  { key: 'weekend', label: 'Weekend', hint: 'Saturday and Sunday' },
]
const BUDGET_OPTS: { key: Exclude<Budget, ''>; label: string }[] = [
  { key: 'free', label: 'Free' }, { key: '30', label: 'Under $30' }, { key: '75', label: 'Under $75' },
]
interface AiResult { id: string; title: string; date: string; time: string | null; venueName: string; suburb: string | null; city: string; category: string; isFree: boolean; price: string | null }
interface AiResponse { filters: AiSearchFilters; ai: boolean; relaxed: boolean; total: number; results: AiResult[] }

const PLAN_SUGGESTIONS = ['Saturday date night', 'Family Sunday', 'Free afternoon', 'Family day out']
const SEARCH_SUGGESTIONS = ['Live music', 'Comedy under $40', 'LGBTIQ+ this week']

function pickedHints(h: Hints) {
  return !!(h.when || h.budget || h.category || h.area.trim())
}

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

const fieldClass = 'h-control w-full rounded-full border border-border bg-[var(--vp-on-light-fill)] px-3.5 text-sm font-semibold text-[var(--vp-on-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

/** Hero search. A plan-shaped ask shows a ready-made outing. Everything else stays a listing search. */
export function AiSearchBar({ city, today, onShowAll, placeholder, queryRequest, chips = true, inputId = 'ai-search', goToPage = false }: { city: string; today: string | null; onShowAll: (f: AiSearchFilters) => void; placeholder?: string; queryRequest?: { id: number; text: string } | null; chips?: boolean; inputId?: string; goToPage?: boolean }) {
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

  const search = async (query: string, h: Hints = hints, closeOnSend = false, coords?: { lat: number; lng: number }) => {
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
      const res = await fetch('/api/ai-search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: text.length >= 2 ? text : '', city, hints: h, ...(coords ?? {}) }) })
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
    setQ(queryRequest.text)
    void search(queryRequest.text, NO_HINTS, false)
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
  const setHint = <K extends keyof Hints>(k: K, v: Hints[K]) => {
    setHints((h) => {
      const next = { ...h, [k]: h[k] === v && k !== 'area' ? '' : v } as Hints
      if (!pickedHints(next) && q.trim().length < 2) queueMicrotask(() => setData(null))
      return next
    })
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

  const errorEl = error
    ? <p role="alert" className={open ? 'mb-3 text-sm font-medium text-red-700' : 'mt-hero rounded-card border border-border bg-card p-card text-sm font-medium text-foreground'}>{error}</p>
    : null

  return (
    <div className="flex-1 min-w-0">
      <div ref={rootRef} className="overflow-hidden rounded-hero bg-white text-[var(--vp-on-light)] ring-2 ring-primary/50 focus-within:ring-primary shadow-vp-md">
        <form role="search" action={goToPage ? '/search' : undefined} method={goToPage ? 'get' : undefined} onSubmit={(e) => { if (goToPage) return; e.preventDefault(); void search(q, hints, true) }} className="flex h-control-lg items-center gap-2 pl-4 pr-1.5">
          <Sparkles className="w-5 h-5 text-primary shrink-0" aria-hidden />
          {goToPage && <input type="hidden" name="city" value={city} />}
          <label htmlFor={inputId} className="sr-only">Tell us your vibe</label>
          <input
            id={inputId} ref={inputRef} name={goToPage ? 'q' : undefined} type="search" value={q} maxLength={200} autoComplete="off" enterKeyHint="search" inputMode="search"
            aria-describedby={`${inputId}-help`}
            onFocus={reveal}
            onClick={reveal}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown') return
              e.preventDefault()
              focusPanel()
            }}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder ?? 'Ask for a vibe…'}
            className="min-w-0 flex-1 bg-transparent text-base text-[var(--vp-on-light)] placeholder:text-[var(--vp-text-muted)] focus:outline-none" />
          <p id={`${inputId}-help`} className="sr-only">Tell us your vibe, or open filters for time, budget, suburb and suggestions.</p>
          {q && !working && (
            <IconButton type="button" variant="ghost" label="Clear search" onClick={clearBar} className="text-[var(--vp-on-light)]"><X className="h-4 w-4" /></IconButton>
          )}
          <IconButton
            type="button"
            variant="ghost"
            aria-expanded={open}
            aria-controls={`${inputId}-panel`}
            label={hintCount ? `Filters, ${hintCount} on` : 'Filters'}
            onClick={() => setOpen((v) => !v)}
            className="relative text-[var(--vp-on-light)]"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {hintCount > 0 && (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-xs font-bold leading-none text-on-primary" aria-hidden>{hintCount}</span>
            )}
          </IconButton>
          <Button type="submit" size="md" disabled={working} aria-label="Find events" className="shrink-0">
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ArrowRight className="h-4 w-4 sm:hidden" aria-hidden /><span className="hidden sm:inline">Find events</span></>}
          </Button>
        </form>

        {chips && (
          <div className="grid gap-3 px-3 pb-3">
            <ChipGroup onLight label="Plan my..." icon={<CalendarRange className="h-3.5 w-3.5" aria-hidden />}>
              {PLAN_SUGGESTIONS.map((s) => (
                <Chip key={s} onLight type="button" onClick={() => search(s, hints, true)} disabled={busy}>{s}</Chip>
              ))}
            </ChipGroup>
            <ChipGroup onLight label="Search" icon={<Search className="h-3.5 w-3.5" aria-hidden />}>
              {SEARCH_SUGGESTIONS.map((s) => (
                <Chip key={s} onLight type="button" onClick={() => search(s, hints, true)} disabled={busy}>{s}</Chip>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div role="group" aria-label="When" className="min-w-0">
                <div className="vp-eyebrow mb-2 text-[var(--vp-on-light)]">When</div>
                <div className="flex flex-wrap gap-2">
                  {WHEN_OPTS.map((o) => (
                    <Chip key={o.key} onLight title={o.hint} pressed={hints.when === o.key} onClick={() => setHint('when', o.key)}>{o.label}</Chip>
                  ))}
                </div>
              </div>
              <div role="group" aria-label="Budget" className="min-w-0">
                <div className="vp-eyebrow mb-2 text-[var(--vp-on-light)]">Budget</div>
                <div className="flex flex-wrap gap-2">
                  {BUDGET_OPTS.map((o) => (
                    <Chip key={o.key} onLight pressed={hints.budget === o.key} onClick={() => setHint('budget', o.key)}>{o.label}</Chip>
                  ))}
                </div>
              </div>
              <div className="min-w-0">
                <label htmlFor="ai-search-category" className="vp-eyebrow mb-2 block text-[var(--vp-on-light)]">Vibe</label>
                <span className="relative block">
                  <select id="ai-search-category" value={hints.category} onChange={(e) => setHint('category', e.target.value)} aria-label="Vibe"
                    className={cn(fieldClass, 'appearance-none pr-8 text-left', hints.category && 'bg-primary text-on-primary')}>
                    <option value="">Any vibe</option>
                    {CATEGORIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-80" />
                </span>
              </div>
              <div className="min-w-0">
                <label htmlFor="ai-search-suburb" className="vp-eyebrow mb-2 block text-[var(--vp-on-light)]">Suburb</label>
                <span className="relative block">
                  <MapPin className={cn('pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2', hints.area.trim() ? 'text-on-primary' : 'text-[var(--vp-on-light)]')} />
                  <input id="ai-search-suburb" value={hints.area} onChange={(e) => setHint('area', e.target.value)} maxLength={40} autoComplete="off"
                    placeholder="Any suburb" className={cn(fieldClass, 'pl-9', hints.area.trim() && 'bg-primary text-on-primary placeholder:text-on-primary/70')} />
                </span>
              </div>
              {hasHints && (
                <div className="flex justify-end sm:col-span-2">
                  <button type="button" onClick={clearHints} className="inline-flex h-control items-center rounded-full px-3 text-sm font-semibold text-[var(--vp-on-light)] underline-offset-2 hover:underline">Clear picks</button>
                </div>
              )}
            </div>
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
        <div className="mt-hero rounded-card border border-border bg-card p-card text-card-foreground shadow-vp-sm" aria-live="polite">
          {planFallback && <p className="mb-3 text-sm text-foreground">{planFallback}</p>}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-foreground">{data.ai ? 'Got it:' : 'Searching for:'}</span>
            {understood(data.filters, today).map((c) => <span key={c} className="inline-flex min-h-6 items-center rounded-full bg-muted px-2.5 py-1 text-sm font-semibold text-foreground">{c}</span>)}
          </div>
          {data.relaxed && <p className="mt-2 text-sm text-muted-foreground">Couldn’t nail every word, but these tick most of your boxes.</p>}

          {data.results.length ? (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.results.map((e) => {
                const Icon = categoryIcon(e.category)
                const clock = formatTime(e.time)
                return (
                  <li key={e.id} className="flex">
                    <Link href={eventPath(e)} className="group flex min-h-control w-full gap-3 rounded-control border border-border bg-background p-3 text-foreground hover:bg-muted">
                      <span className="mt-0.5 grid h-control w-control shrink-0 place-items-center rounded-control bg-primary/15 text-primary"><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="block font-semibold leading-snug line-clamp-2 group-hover:underline">{e.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground">
                          <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" />{dayLabel(e.date, today)}{clock ? ` · ${clock}` : ''}</span>
                          <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{e.venueName}{e.suburb ? `, ${e.suburb}` : ''}</span></span>
                          {e.isFree && <span className="rounded-full bg-[hsl(var(--free))] px-2 py-0.5 text-xs font-semibold text-white">Free</span>}
                        </span>
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
              <Button type="button" variant="ghost" size="md" onClick={() => { reqId.current++; planReq.current += 1; setBusy(false); setPlanBusy(false); setData(null); setPlan(null); setPlanHistory([]); setQ(''); setHints(NO_HINTS); setError(''); setPlanError(''); inputRef.current?.focus() }}>Start Fresh</Button>
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
