'use client'

import { useEffect, useRef, useState } from 'react'
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

/** Hero search: plain-English request → AI-parsed filters → real listings only. */
export function AiSearchBar({ city, today, onShowAll }: { city: string; today: string | null; onShowAll: (f: AiSearchFilters) => void }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<AiResponse | null>(null)
  const [hints, setHints] = useState<Hints>(NO_HINTS)
  const inputRef = useRef<HTMLInputElement>(null)
  const reqId = useRef(0)
  const hasHints = !!(hints.when || hints.budget || hints.category || hints.area.trim())

  const search = async (query: string, h: Hints = hints) => {
    const text = query.trim()
    const picked = !!(h.when || h.budget || h.category || h.area.trim())
    if (text.length < 2 && !picked) { setError('Tell us what you feel like doing, e.g. “jazz on Friday night”, or tap a quick pick below.'); inputRef.current?.focus(); return }
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

  // Quick picks refine the search live, like answering a few quick questions.
  const hintsKey = JSON.stringify(hints)
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    if (!hasHints && !data) return
    if (!hasHints && q.trim().length < 2) { setData(null); return }
    const t = setTimeout(() => search(q, hints), 450)
    return () => clearTimeout(t)
  }, [hintsKey, city])

  const setHint = <K extends keyof Hints>(k: K, v: Hints[K]) => setHints((h) => ({ ...h, [k]: h[k] === v && k !== 'area' ? '' : v }))
  const chip = (on: boolean) => cn('h-8 rounded-full px-3 text-sm ring-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
    on ? 'bg-primary text-primary-foreground ring-primary font-medium' : 'bg-white/[0.06] text-white/90 ring-white/15 hover:bg-white/[0.12] hover:text-white')

  return (
    <div className="flex-1 min-w-0">
      <form role="search" onSubmit={(e) => { e.preventDefault(); search(q) }} className="flex items-center gap-2 rounded-xl bg-white text-foreground pl-4 pr-1.5 h-14 ring-2 ring-primary/50 focus-within:ring-primary shadow-[0_10px_30px_-12px_rgba(232,85,63,0.55)]">
        <Sparkles className="w-5 h-5 text-primary shrink-0" aria-hidden />
        <label htmlFor="ai-search" className="sr-only">Tell us your vibe</label>
        <input
          id="ai-search" ref={inputRef} type="text" value={q} maxLength={200} autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Tell us your vibe, e.g. ‘cheap jazz Friday night’`}
          className="flex-1 min-w-0 bg-transparent text-base sm:text-lg text-neutral-900 placeholder:text-neutral-500 focus:outline-none" />
        {q && !busy && (
          <button type="button" aria-label="Clear search" onClick={() => { setQ(''); setData(null); setError(''); inputRef.current?.focus() }} className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-900"><X className="w-4 h-4" /></button>
        )}
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 sm:px-5 h-11 text-sm sm:text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-70">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}<span className="hidden sm:inline">Ask Outza</span><span className="sm:hidden">Go</span>
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Quick picks">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="When?">
          <span className="text-sm text-white/80 mr-0.5">When?</span>
          {WHEN_OPTS.map((o) => (
            <button key={o.key} type="button" title={o.hint} aria-pressed={hints.when === o.key} onClick={() => setHint('when', o.key)} className={chip(hints.when === o.key)}>{o.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Budget">
          <span className="text-sm text-white/80 mr-0.5">Budget</span>
          {BUDGET_OPTS.map((o) => (
            <button key={o.key} type="button" aria-pressed={hints.budget === o.key} onClick={() => setHint('budget', o.key)} className={chip(hints.budget === o.key)}>{o.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="relative">
            <select value={hints.category} onChange={(e) => setHint('category', e.target.value)} aria-label="Interests"
              className={cn(chip(!!hints.category), 'appearance-none pr-8 cursor-pointer')}>
              <option value="" className="bg-popover text-popover-foreground">Any vibe</option>
              {CATEGORIES.map((c) => <option key={c.name} value={c.name} className="bg-popover text-popover-foreground">{c.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-80" />
          </span>
          <span className="relative">
            <MapPin className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/60" />
            <input value={hints.area} onChange={(e) => setHint('area', e.target.value)} maxLength={40} aria-label="Suburb or area"
              placeholder="Any suburb" className={cn(chip(!!hints.area.trim()), 'w-36 pl-7 placeholder:text-white/75')} />
          </span>
          {hasHints && (
            <button type="button" onClick={() => setHints(NO_HINTS)} className="h-8 px-2 text-sm text-white/80 hover:text-white underline-offset-2 hover:underline">Clear Picks</button>
          )}
        </div>
      </div>

      {/* Fixed height so opening results does not push the board. Longer lists scroll inside. */}
      <div className="mt-3 h-64 sm:h-72 overflow-y-auto" aria-live="polite">
      {!data && !hasHints && (
        <div className="flex flex-wrap gap-2" aria-label="Try asking">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => search(s)} disabled={busy} className="rounded-full bg-white/[0.06] px-3 py-1.5 text-sm text-white/90 ring-1 ring-white/15 hover:bg-white/[0.12] hover:text-white disabled:opacity-60">
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="text-base sm:text-sm text-[#ffb4a6]">{error}</p>}

      {data && (
        <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-white/80">{data.ai ? 'Outza AI understood:' : 'Searching for:'}</span>
            {understood(data.filters, today).map((c) => <span key={c} className="rounded-full bg-primary/15 text-[#ffb4a6] px-2.5 py-0.5 ring-1 ring-primary/30">{c}</span>)}
          </div>
          {data.relaxed && <p className="mt-2 text-sm text-white/85">Couldn’t nail every word, but these tick most of your boxes.</p>}

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
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-white/80">
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
            <p className="mt-3 text-base sm:text-sm text-white/90">Nothing on Outza matches that yet{city ? ` in ${city}` : ''}. Try different dates, a wider area or fewer details.</p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-white/80">Real listings only. Our AI reads your request; it never makes events up.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { reqId.current++; setBusy(false); setData(null); setQ(''); setHints(NO_HINTS); setError(''); inputRef.current?.focus() }} className="rounded-lg px-3 h-9 text-sm text-white/80 hover:text-white hover:bg-white/[0.06]">New Search</button>
              {data.total > 0 && (
                <button type="button" onClick={() => onShowAll(data.filters)} className={cn('inline-flex items-center gap-1.5 rounded-lg bg-white/[0.08] px-3 h-9 text-sm font-medium hover:bg-white/[0.14]')}>
                  {data.total > data.results.length ? `See All ${data.total} on the Board` : 'Open on the Board'}<ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
