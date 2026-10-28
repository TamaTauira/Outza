'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, ChevronDown, Loader2, MapPin, Sparkles, X } from 'lucide-react'
import { categoryIcon, dayLabel, formatTime } from '@/lib/board'
import { CATEGORIES } from '@/lib/categories'
import { eventPath } from '@/lib/seo'
import { cn } from '@/lib/utils'

export interface AiSearchFilters {
  dateFrom: string; dateTo: string; category: string; isFree: boolean; maxPrice: number | null
  lgbtiq: boolean; timeOfDay: 'morning' | 'afternoon' | 'evening' | 'any'; suburb: string; keywords: string[]; soon: boolean
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

const SUGGESTIONS = ['Free things to do this weekend', 'Live music tonight', 'Family day out on Sunday morning', 'Comedy under $40', 'LGBTIQ+ events this week', 'Markets this weekend']

function pickedHints(h: Hints) {
  return !!(h.when || h.budget || h.category || h.area.trim())
}

function hintSummary(h: Hints) {
  return [
    WHEN_OPTS.find((o) => o.key === h.when)?.label,
    BUDGET_OPTS.find((o) => o.key === h.budget)?.label,
    h.category,
    h.area.trim(),
  ].filter(Boolean).join(' · ')
}

function understood(f: AiSearchFilters, today: string | null): string[] {
  const when = f.dateFrom === f.dateTo ? dayLabel(f.dateFrom, today) : `${dayLabel(f.dateFrom, today)} – ${dayLabel(f.dateTo, today)}`
  return [
    f.soon ? 'Next 3 hours' : when,
    f.timeOfDay !== 'any' ? f.timeOfDay[0].toUpperCase() + f.timeOfDay.slice(1) : '',
    f.category,
    f.isFree ? 'Free' : f.maxPrice ? `Under $${f.maxPrice}` : '',
    f.lgbtiq ? 'LGBTIQ+' : '',
    f.suburb ? `Near ${f.suburb}` : '',
    ...f.keywords.map((k) => `“${k}”`),
  ].filter(Boolean)
}

const pickClass = (on: boolean) => cn(
  'h-9 rounded-full px-3 text-sm ring-1 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70',
  on ? 'bg-primary text-primary-foreground ring-primary font-medium' : 'bg-neutral-100 text-neutral-800 ring-neutral-200 hover:bg-neutral-200',
)

/** Hero search: plain-English request → AI-parsed filters → real listings only.
 *  Suggested prompts and quick picks open inside the white bar, not as rows under it. */
export function AiSearchBar({ city, today, onShowAll }: { city: string; today: string | null; onShowAll: (f: AiSearchFilters) => void }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<AiResponse | null>(null)
  const [hints, setHints] = useState<Hints>(NO_HINTS)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const skipOpen = useRef(false)
  const reqId = useRef(0)
  const hasHints = pickedHints(hints)

  const search = async (query: string, h: Hints = hints, closeOnSend = false) => {
    const text = query.trim()
    const picked = pickedHints(h)
    if (text.length < 2 && !picked) {
      setError('Tell us what you feel like doing, e.g. “jazz on Friday night”, or pick a time, budget or idea.')
      setOpen(true)
      inputRef.current?.focus()
      return
    }
    if (closeOnSend) setOpen(false)
    const id = ++reqId.current
    setQ(text); setBusy(true); setError('')
    try {
      const res = await fetch('/api/ai-search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: text.length >= 2 ? text : '', city, hints: h }) })
      if (id !== reqId.current) return
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d?.error ?? 'Search is unavailable right now.'); setData(null); return }
      setData(d)
    } catch (err) {
      console.error(err); setError('Search is unavailable right now.'); setData(null)
    } finally { if (id === reqId.current) setBusy(false) }
  }

  // Quick picks refine the search live. Query text waits for Ask Outza, so it is not a dependency.
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
    if (skipOpen.current) { skipOpen.current = false; return }
    setOpen(true)
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
  const summary = hintSummary(hints)
  const keepFocus = (e: MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('input, select, textarea')) return
    e.preventDefault()
  }

  const errorEl = error
    ? <p role="alert" className={open ? 'mb-3 text-sm text-red-700' : 'mt-3 text-sm text-[#ffb4a6]'}>{error}</p>
    : null

  return (
    <div className="flex-1 min-w-0">
      <div ref={rootRef} className="rounded-xl bg-white text-neutral-900 ring-2 ring-primary/50 focus-within:ring-primary shadow-[0_10px_30px_-12px_rgba(232,85,63,0.55)] overflow-hidden">
        <form role="search" onSubmit={(e) => { e.preventDefault(); void search(q, hints, true) }} className="flex items-center gap-2 pl-4 pr-1.5 h-14">
          <Sparkles className="w-5 h-5 text-primary shrink-0" aria-hidden />
          <label htmlFor="ai-search" className="sr-only">Tell us your vibe</label>
          <input
            id="ai-search" ref={inputRef} type="text" value={q} maxLength={200} autoComplete="off" enterKeyHint="search"
            aria-describedby="ai-search-help"
            onFocus={reveal}
            onClick={reveal}
            onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); focusPanel() } }}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tell us your vibe, e.g. ‘cheap jazz Friday night’"
            className="flex-1 min-w-0 bg-transparent text-base sm:text-lg text-neutral-900 placeholder:text-neutral-500 focus:outline-none" />
          <p id="ai-search-help" className="sr-only">Type a vibe, or open ideas and filters for times, budget, suburb and suggestions.</p>
          {q && !busy && (
            <button type="button" aria-label="Clear search" onClick={() => { setQ(''); setData(null); setError(''); inputRef.current?.focus() }} className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"><X className="w-4 h-4" /></button>
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? 'ai-search-panel' : undefined}
            aria-label={open ? 'Hide ideas and filters' : hasHints ? `Show ideas and filters, ${summary} selected` : 'Show ideas and filters'}
            onClick={() => setOpen((v) => !v)}
            className="hidden sm:grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <ChevronDown className={cn('w-4 h-4 transition-transform duration-150', open && 'rotate-180')} />
          </button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 sm:px-5 h-11 text-sm sm:text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/30">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}<span className="hidden sm:inline">Ask Outza</span><span className="sm:hidden">Go</span>
          </button>
        </form>

        {open && (
          <div
            id="ai-search-panel"
            ref={panelRef}
            role="region"
            aria-label="Ideas and filters"
            onMouseDown={keepFocus}
            className="border-t border-neutral-200 sm:max-h-[min(28rem,70vh)] sm:overflow-y-auto overscroll-contain"
          >
            <div className="p-3 sm:p-4">
              {errorEl}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Try asking</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Suggested searches">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => search(s, hints, true)} disabled={busy} className="rounded-full bg-neutral-100 px-3 py-1.5 text-left text-sm text-neutral-800 ring-1 ring-neutral-200 hover:bg-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-60">
                    {s}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-neutral-200 pt-4 sm:grid-cols-2">
                <div role="group" aria-labelledby="ai-search-when" className="min-w-0">
                  <div id="ai-search-when" className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">When</div>
                  <div className="flex flex-wrap gap-1.5">
                    {WHEN_OPTS.map((o) => (
                      <button key={o.key} type="button" title={o.hint} aria-pressed={hints.when === o.key} onClick={() => setHint('when', o.key)} className={pickClass(hints.when === o.key)}>{o.label}</button>
                    ))}
                  </div>
                </div>
                <div role="group" aria-labelledby="ai-search-budget" className="min-w-0">
                  <div id="ai-search-budget" className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Budget</div>
                  <div className="flex flex-wrap gap-1.5">
                    {BUDGET_OPTS.map((o) => (
                      <button key={o.key} type="button" aria-pressed={hints.budget === o.key} onClick={() => setHint('budget', o.key)} className={pickClass(hints.budget === o.key)}>{o.label}</button>
                    ))}
                  </div>
                </div>
                <div className="min-w-0">
                  <label id="ai-search-vibe" htmlFor="ai-search-category" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Vibe</label>
                  <span className="relative block">
                    <select id="ai-search-category" value={hints.category} onChange={(e) => setHint('category', e.target.value)} aria-labelledby="ai-search-vibe"
                      className={cn(pickClass(!!hints.category), 'w-full appearance-none pr-8 text-left')}>
                      <option value="" className="bg-white text-neutral-900">Any vibe</option>
                      {CATEGORIES.map((c) => <option key={c.name} value={c.name} className="bg-white text-neutral-900">{c.name}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-80" />
                  </span>
                </div>
                <div className="min-w-0">
                  <label htmlFor="ai-search-suburb" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Suburb</label>
                  <span className="relative block">
                    <MapPin className={cn('pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5', hints.area.trim() ? 'text-primary-foreground' : 'text-neutral-500')} />
                    <input id="ai-search-suburb" value={hints.area} onChange={(e) => setHint('area', e.target.value)} maxLength={40} autoComplete="off"
                      placeholder="Any suburb" className={cn(pickClass(!!hints.area.trim()), 'w-full pl-8 placeholder:text-neutral-500')} />
                  </span>
                </div>
                {hasHints && (
                  <div className="flex justify-end sm:col-span-2">
                    <button type="button" onClick={clearHints} className="text-sm font-medium text-neutral-500 hover:text-neutral-900 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 rounded">Clear picks</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!open && hasHints && (
          <div className="flex items-center gap-3 border-t border-neutral-200 px-4 py-2">
            <button type="button" onClick={() => setOpen(true)} title={summary} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-neutral-700 hover:text-neutral-900 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span className="truncate">{summary}</span>
            </button>
            <button type="button" onClick={clearHints} className="shrink-0 text-sm font-medium text-neutral-500 hover:text-neutral-900 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">Clear picks</button>
          </div>
        )}
      </div>

      {!open && errorEl}

      {data && (
        <div className="mt-4 rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <span className="text-white/60">{data.ai ? 'Outza AI understood:' : 'Searching for:'}</span>
            {understood(data.filters, today).map((c) => <span key={c} className="rounded-full bg-primary/15 text-[#ffb4a6] px-2.5 py-0.5 ring-1 ring-primary/30">{c}</span>)}
          </div>
          {data.relaxed && <p className="mt-2 text-xs sm:text-sm text-white/70">Couldn’t nail every word, but these tick most of your boxes.</p>}

          {data.results.length ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {data.results.map((e) => {
                const Icon = categoryIcon(e.category)
                const t = formatTime(e.time)
                return (
                  <li key={e.id}>
                    <Link href={eventPath(e)} className="group flex gap-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] p-3 ring-1 ring-white/5 transition-colors">
                      <span className="mt-0.5 grid place-items-center w-9 h-9 rounded-md bg-primary/15 text-primary shrink-0"><Icon className="w-4 h-4" /></span>
                      <span className="min-w-0">
                        <span className="block font-semibold leading-snug line-clamp-2 group-hover:underline">{e.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/70">
                          <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{dayLabel(e.date, today)}{e.time ? ` · ${t.hm}${t.ampm}` : ''}</span>
                          <span className="inline-flex items-center gap-1 min-w-0"><MapPin className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{e.venueName}{e.suburb ? `, ${e.suburb}` : ''}</span></span>
                          {e.isFree && <span className="rounded bg-emerald-400/15 text-emerald-300 px-1.5">Free</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-white/80">Nothing on Outza matches that yet{city ? ` in ${city}` : ''}. Try different dates, a wider area or fewer details.</p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/55">Real listings only. Our AI reads your request; it never makes events up.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { reqId.current++; setBusy(false); setData(null); setQ(''); setHints(NO_HINTS); setError(''); inputRef.current?.focus() }} className="rounded-lg px-3 h-9 text-sm text-white/80 hover:text-white hover:bg-white/[0.06]">New Search</button>
              {data.total > 0 && (
                <button type="button" onClick={() => onShowAll(data.filters)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.08] px-3 h-9 text-sm font-medium hover:bg-white/[0.14]">
                  {data.total > data.results.length ? `See All ${data.total} on the Board` : 'Open on the Board'}<ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
