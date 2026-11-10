'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Bookmark, ChevronDown, Heart, House, Map as MapIcon, Medal, Palette, PawPrint, Plus, ShieldCheck, Shirt, ShoppingBasket, Store, Tag, Trash2, type LucideIcon } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { LocalNeighbourhoodMap, type LocalMapPin } from '@/components/local-neighbourhood-map'
import { useSaved } from '@/lib/saved'
import { CITY_NAMES, DEFAULT_CITY, cityDef } from '@/lib/cities'
import { readCity, writeCity } from '@/lib/city-pref'
import { LOCAL_SOURCES, fmtDay, fmtTime, localPath } from '@/lib/local-shared'
import { sectionByKey } from '@/lib/community-shared'
import { LOCAL_TILES, localTileFor } from '@/lib/local-tiles'
import { dayLabel } from '@/lib/board'
import { CommunitySubmitForm } from './community-submit-form'
import { cn } from '@/lib/utils'
import { citySlug } from '@/lib/seo'
import { holdScrollRestore } from '@/lib/scroll-memory'

type Item = {
  id: string
  title: string
  section: string
  suburb: string
  city: string
  date: string
  time: string | null
  isFree: boolean
  price: string | null
  href: string
  kind?: string
  status?: string | null
  lat?: number | null
  lng?: number | null
}
type Mine = { id: string; title: string; suburb: string; status: string; expiresAt: string; reviewNote: string | null; startDate: string; startTime: string; endTime: string; schedule: string }
type MineCommunity = { id: string; title: string; suburb: string | null; city: string; communityKey: string | null; approvalState: string | null; status: string; href: string }

const TABS = [{ key: 'browse', label: 'What’s on nearby', short: 'Nearby' }, { key: 'submit', label: 'List something', short: 'List' }, { key: 'mine', label: 'My listings', short: 'Mine' }, { key: 'how', label: 'How VibePeep Local works', short: 'How' }] as const
const WHEN = [{ key: 'today', label: 'Today' }, { key: 'weekend', label: 'This weekend' }, { key: '7', label: 'Next 7 days' }, { key: '30', label: 'Next 30 days' }]
const TILE_ICONS: Record<string, LucideIcon> = {
  'garage-sales': Shirt,
  'warehouse-sales': Tag,
  'school-fundraisers': Heart,
  'farmers-markets': ShoppingBasket,
  'neighbourhood-popups': Store,
  'community-sport': Medal,
  'dog-friendly': PawPrint,
  'local-art': Palette,
}
const PREVIEW = 5

function nowIn(tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) }
}

const rowKey = (ev: Item) => `${ev.kind ?? 'row'}:${ev.id}:${ev.date}`

function clock(time: string | null) {
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return ''
  return fmtTime(time)
}

const pill = (on: boolean) => cn(
  'h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors',
  on ? 'bg-foreground text-background' : 'border border-border bg-card text-foreground hover:bg-muted',
)

export function LocalClient() {
  const router = useRouter()
  const params = useSearchParams()
  const { saved, isSaved, toggle } = useSaved()
  const { data: session } = useSession() || {}
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'browse') as (typeof TABS)[number]['key']
  const setTab = (t: string) => router.replace(t === 'browse' ? '/local' : `/local?tab=${t}`, { scroll: false })

  const [city, setCityState] = useState(DEFAULT_CITY)
  const setCity = (c: string) => { setCityState(c); writeCity(c) }
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null)
  const [category, setCategory] = useState(params.get('category') ?? '')
  const [suburb, setSuburb] = useState(params.get('suburb') ?? '')
  const [suburbQuery, setSuburbQuery] = useState(params.get('suburb') ?? '')
  const [when, setWhen] = useState(params.get('when') ?? 'weekend')
  const [data, setData] = useState<{ key: string; items: Item[]; counts: Record<string, number> } | null>(null)
  const [mine, setMine] = useState<Mine[] | null>(null)
  const [mineCommunity, setMineCommunity] = useState<MineCommunity[]>([])
  const [now, setNow] = useState<{ date: string; minutes: number } | null>(null)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [more, setMore] = useState<Record<string, boolean>>({})
  const [hotKey, setHotKey] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [wide, setWide] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)

  useEffect(() => {
    const tick = () => setNow(nowIn(cityDef(city).tz))
    tick()
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [city])

  useEffect(() => {
    const id = setTimeout(() => {
      const savedCity = readCity()
      if (savedCity && CITY_NAMES.includes(savedCity)) setCityState(savedCity)
    }, 0)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const apply = () => setWide(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setSuburbQuery(suburb), 250)
    return () => clearTimeout(t)
  }, [suburb])

  const requestKey = `${city}|${category}|${when}|${suburbQuery}`
  const requestRef = useRef(0)
  useEffect(() => {
    if (tab !== 'browse') return
    const key = requestKey
    const ticket = ++requestRef.current
    const ac = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; ac.abort() }, 8000)
    const release = holdScrollRestore('local-list')
    fetch(`/api/local?${new URLSearchParams({ city, category, when, suburb: suburbQuery })}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => {
        if (requestRef.current !== ticket) return
        if (d?.notice && !d?.items?.length) {
          setData(null)
          setLoadError({ key, message: 'We couldn’t load local listings just now. Give it another go in a moment.' })
          return
        }
        setData({ key, items: d?.items ?? [], counts: d?.counts ?? {} })
        setLoadError(null)
      })
      .catch((e) => {
        console.error(e)
        if (requestRef.current !== ticket || (e?.name === 'AbortError' && !timedOut)) return
        setData(null)
        setLoadError({ key, message: timedOut || e?.name === 'AbortError' ? 'Listings are taking too long to load. Nothing is waiting — try again in a moment, or list something yourself.' : 'We couldn’t load local listings just now.' })
      })
      .finally(() => { clearTimeout(timer); release() })
    return () => { clearTimeout(timer); ac.abort(); release() }
  }, [tab, city, category, when, suburbQuery, requestKey])

  const loadMine = useCallback(() => {
    fetch('/api/local?mine=1').then((r) => (r.ok ? r.json() : { listings: [] })).then((j) => { setMine(j.listings ?? []); setMineCommunity(j.community ?? []) }).catch((e) => { console.error(e); setMine([]); setMineCommunity([]) })
  }, [])
  useEffect(() => { if (tab === 'mine' && session?.user) loadMine() }, [tab, session?.user, loadMine])

  const view = data?.key === requestKey ? data : null
  const error = loadError?.key === requestKey ? loadError.message : null

  const days = useMemo(() => {
    const m = new Map<string, Item[]>()
    view?.items.forEach((i) => m.set(i.date, [...(m.get(i.date) ?? []), i]))
    return [...m.entries()]
  }, [view])

  const pins = useMemo<LocalMapPin[]>(() => (view?.items ?? []).flatMap((ev) => {
    if (typeof ev.lat !== 'number' || typeof ev.lng !== 'number' || !Number.isFinite(ev.lat) || !Number.isFinite(ev.lng)) return []
    return [{ key: rowKey(ev), title: ev.title, suburb: ev.suburb, lat: ev.lat, lng: ev.lng }]
  }), [view])

  const focusPin = (key: string) => {
    const item = view?.items.find((ev) => rowKey(ev) === key)
    if (item) {
      setClosed((c) => (c[item.date] ? { ...c, [item.date]: false } : c))
      setMore((m) => (m[item.date] ? m : { ...m, [item.date]: true }))
    }
    setHotKey(key)
    setFocusKey(key)
  }

  useEffect(() => {
    if (!focusKey) return
    const id = requestAnimationFrame(() => {
      document.querySelector(`[data-row="${CSS.escape(focusKey)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [focusKey, view])

  const remove = async (id: string) => {
    if (!confirm('Take this listing down? This removes every upcoming date.')) return
    const res = await fetch(`/api/local/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Listing removed'); loadMine() } else toast.error('Could not remove it')
  }

  const whenLabel = WHEN.find((w) => w.key === when)?.label.toLowerCase() ?? 'soon'
  const showMap = wide || mapOpen

  const save = (ev: Item) => toggle({
    id: ev.id,
    title: ev.title,
    description: null,
    date: ev.date,
    endDate: null,
    time: ev.time,
    endTime: null,
    venueName: ev.suburb || ev.title,
    suburb: ev.suburb,
    category: sectionByKey(ev.section)?.boardCategory ?? 'Community',
    subTags: [],
    isLGBTI: false,
    isFree: ev.isFree,
    price: ev.price,
    ticketUrl: null,
    city: ev.city,
    href: ev.href || '/local',
    latitude: ev.lat ?? null,
    longitude: ev.lng ?? null,
  })

  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={saved.length} />
      <main className="vp-wrap min-w-0 px-4 py-6 sm:px-6 lg:py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">VibePeep Local</p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.25rem] lg:leading-[1.05]">Your neighbourhood, unlocked.</h1>
            <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">Garage sales, clearances, markets, fetes, park sport, charity dos, dog walks and local art. One list, and it’s free to add yours.</p>
          </div>
          <button type="button" onClick={() => setTab('submit')} className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-base font-semibold text-primary-foreground shadow-sm">
            <Plus className="h-4 w-4" />List your thing free
          </button>
        </header>

        <div className="relative mt-6 min-w-0">
          <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={cn('relative h-12 shrink-0 px-3 text-sm whitespace-nowrap sm:px-4', tab === t.key ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                <span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span>
                {tab === t.key && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary" />}
              </button>
            ))}
          </div>
        </div>

        {tab === 'browse' && (
          <section className="mt-6">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:grid lg:grid-cols-8 lg:overflow-visible [&::-webkit-scrollbar]:hidden" role="toolbar" aria-label="Categories">
              {LOCAL_TILES.map((tile) => {
                const on = category === tile.key
                const Icon = TILE_ICONS[tile.key] ?? Tag
                return (
                  <button
                    key={tile.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCategory(on ? '' : tile.key)}
                    className={cn('relative h-[6.5rem] w-[9.25rem] shrink-0 snap-start overflow-hidden rounded-2xl text-left shadow-sm ring-offset-background transition lg:h-auto lg:w-auto lg:aspect-[16/10]', on ? 'ring-2 ring-primary ring-offset-2' : 'hover:brightness-110')}
                  >
                    <Image src={tile.src} alt="" fill sizes="(min-width: 1024px) 12vw, 148px" className="object-cover" />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10" />
                    <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 p-2 text-white">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-black/40"><Icon className="h-4 w-4" aria-hidden /></span>
                      <span className="text-[13px] font-semibold leading-tight">{tile.label}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none py-1">Photo credits</summary>
              <ul className="mt-1 space-y-1 pl-1">
                {LOCAL_TILES.map((tile) => (
                  <li key={tile.key}>
                    {tile.label}: {tile.credit.author}, <a href={tile.credit.licenceUrl} className="underline" target="_blank" rel="noopener noreferrer">{tile.credit.licence}</a>, <a href={tile.credit.source} className="underline" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>
                  </li>
                ))}
              </ul>
            </details>

            <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex min-w-0 gap-2">
                <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="City" className="h-11 min-w-0 flex-1 rounded-full border border-border bg-card px-3 text-base sm:w-36 sm:flex-none">
                  {CITY_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Suburb" aria-label="Suburb" className="h-11 min-w-0 flex-1 rounded-full border border-border bg-card px-3 text-base sm:w-40 sm:flex-none" />
              </div>
              <div className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {WHEN.map((w) => <button key={w.key} type="button" onClick={() => setWhen(w.key)} className={pill(when === w.key)}>{w.label}</button>)}
              </div>
            </div>

            <div className="vp-local-grid mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
              <div className="order-2 min-w-0 overflow-hidden rounded-2xl border border-border bg-card lg:order-1">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
                  <span className="h-1.5 w-1.5 rounded-full bg-free" />
                  <span><span className="font-semibold text-foreground">{view ? view.items.length : '…'}</span> listings · {whenLabel}{suburbQuery ? ` · ${suburbQuery}` : ''}</span>
                </div>
                {!view && !error && (
                  <div className="space-y-2 p-3">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}
                  </div>
                )}
                {error && (
                  <div className="p-8 text-center">
                    <p className="font-display text-lg font-bold">Couldn’t load listings</p>
                    <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                  </div>
                )}
                {view && !error && !days.length && (
                  <div className="p-8 text-center">
                    <House className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 font-display text-lg font-bold">Nothing listed{category ? ` under ${sectionByKey(category)?.short ?? 'that'}` : ''} for {city} {whenLabel} yet.</p>
                    <p className="mt-1 text-sm text-muted-foreground">Garage sale, fete, market or a dog walk? Be the neighbour who lists it.</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button onClick={() => setTab('submit')} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />List your thing free</button>
                      <Link href={`/${citySlug(city)}/markets`} className="inline-flex h-11 items-center rounded-full bg-muted px-5 text-sm">Markets on the Board</Link>
                    </div>
                  </div>
                )}
                {days.map(([day, rows]) => {
                  const open = !closed[day]
                  const shown = more[day] ? rows : rows.slice(0, PREVIEW)
                  const hidden = rows.length - shown.length
                  return (
                    <section key={day}>
                      <button type="button" onClick={() => setClosed((c) => ({ ...c, [day]: open }))} className="flex w-full items-center gap-3 border-y border-primary/15 bg-primary/[0.08] px-3 py-2.5 text-left sm:px-4" aria-expanded={open}>
                        <span className="text-sm font-semibold">{dayLabel(day, now?.date ?? null)}</span>
                        <span className="font-mono text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? 'event' : 'events'}</span>
                        <ChevronDown className={cn('ml-auto h-4 w-4 text-primary transition-transform', !open && '-rotate-90')} />
                      </button>
                      {open && shown.map((ev) => {
                        const key = rowKey(ev)
                        const hot = hotKey === key || focusKey === key
                        const place = [ev.suburb, clock(ev.time), ev.status === 'CANCELLED' ? 'Cancelled' : ev.status === 'POSTPONED' ? 'Postponed' : ''].filter(Boolean).join(' · ')
                        const cat = sectionByKey(ev.section)?.short ?? 'Local'
                        const thumb = localTileFor(ev.section)?.src
                        return (
                          <div
                            key={key}
                            data-row={key}
                            onMouseEnter={() => setHotKey(key)}
                            onMouseLeave={() => setHotKey((current) => (current === key ? null : current))}
                            onFocus={() => setHotKey(key)}
                            className={cn('flex scroll-mt-24 items-center gap-2 border-b border-border/70 px-2 py-1.5 last:border-0 sm:gap-3 sm:px-3', hot && 'bg-primary/10')}
                          >
                            <Link href={ev.href || '/local'} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                              {thumb ? <Image src={thumb} alt="" width={56} height={48} className="h-12 w-14 shrink-0 rounded-lg object-cover" /> : <span className="grid h-12 w-14 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">{cat.slice(0, 1)}</span>}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold leading-snug">{ev.title}</span>
                                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground lg:hidden">
                                  <span>{place}</span>
                                  {ev.isFree && <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white">Free</span>}
                                  {!ev.isFree && ev.price && <span className="font-mono text-xs text-foreground">{ev.price}</span>}
                                  <span>{cat}</span>
                                </span>
                              </span>
                              <span className="hidden shrink-0 items-center gap-3 text-sm text-muted-foreground lg:flex">
                                <span className="w-44 truncate text-right">{place}</span>
                                {ev.isFree && <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white">Free</span>}
                                {!ev.isFree && ev.price && <span className="font-mono text-xs text-foreground">{ev.price}</span>}
                                <span className="w-32 truncate">{cat}</span>
                              </span>
                            </Link>
                            <button type="button" onClick={() => save(ev)} aria-label={isSaved(ev.id) ? 'Remove from saved' : 'Save'} className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full', isSaved(ev.id) ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
                              <Bookmark className={cn('h-4 w-4', isSaved(ev.id) && 'fill-current')} />
                            </button>
                          </div>
                        )
                      })}
                      {open && hidden > 0 && (
                        <button type="button" onClick={() => setMore((m) => ({ ...m, [day]: true }))} className="w-full px-4 py-3 text-left text-sm font-semibold text-primary hover:underline">
                          Show {hidden} more {hidden === 1 ? 'event' : 'events'}
                        </button>
                      )}
                    </section>
                  )
                })}
              </div>

              <div className="order-1 min-w-0 lg:sticky lg:top-20 lg:order-2 lg:h-[min(42rem,calc(100dvh-6.5rem))]">
                <button type="button" onClick={() => setMapOpen((open) => !open)} aria-expanded={mapOpen} className="mb-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-card text-sm font-semibold lg:hidden">
                  <MapIcon className="h-4 w-4 text-primary" />{mapOpen ? 'Hide the map' : 'Show the map'}
                </button>
                {showMap && (
                  <LocalNeighbourhoodMap
                    pins={pins}
                    city={city}
                    hotKey={hotKey}
                    focusKey={focusKey}
                    onHot={setHotKey}
                    onFocus={focusPin}
                    onCity={setCity}
                    loading={!view && !error}
                    className="h-80 lg:h-full"
                  />
                )}
              </div>
            </div>
          </section>
        )}

        {tab === 'submit' && (
          <CommunitySubmitForm category={params.get('category') ?? (category || undefined)} email={session?.user?.email ?? ''} />
        )}

        {tab === 'mine' && (
          <section className="mt-8">
            {!session?.user ? (
              <p className="text-sm text-muted-foreground"><Link href="/login?next=/local?tab=mine" className="text-primary underline">Sign in</Link> to see and manage the listings you’ve added.</p>
            ) : !mine ? <p className="text-sm text-muted-foreground">Loading…</p> : !mine.length && !mineCommunity.length ? (
              <p className="text-sm text-muted-foreground">Nothing here yet. Be the trailblazer. <button onClick={() => setTab('submit')} className="text-primary underline">List something</button></p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {mineCommunity.map((l) => (
                  <div key={l.id} className="rounded-2xl bg-card p-5 shadow-sm">
                    <Link href={l.href} className="font-display font-bold hover:text-primary">{l.title}</Link>
                    <p className="text-sm text-muted-foreground">{[sectionByKey(l.communityKey)?.short, l.suburb, l.city].filter(Boolean).join(' · ')}</p>
                    <span className={cn('mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', l.approvalState === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900')}>
                      {l.approvalState === 'APPROVED' ? 'Live' : 'Being checked'}
                    </span>
                    <p className="mt-2 text-xs text-muted-foreground">Edits, postponements and the poster use the link we emailed you.</p>
                  </div>
                ))}
                {mine.map((l) => (
                  <div key={l.id} className="flex items-start gap-4 rounded-2xl bg-card p-5 shadow-sm">
                    <div className="min-w-0 flex-1">
                      {l.status === 'APPROVED' ? <Link href={localPath(l)} className="font-display font-bold hover:text-primary">{l.title}</Link> : <p className="font-display font-bold">{l.title}</p>}
                      <p className="text-sm text-muted-foreground">{l.schedule} · from {fmtDay(l.startDate)} · {fmtTime(l.startTime)}–{fmtTime(l.endTime)} · {l.suburb}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Shows until {new Date(l.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' })}</p>
                      <span className={cn('mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', l.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : l.status === 'PENDING' ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800')}>
                        {l.status === 'APPROVED' ? 'Live' : l.status === 'PENDING' ? 'Being checked' : 'Not approved'}
                      </span>
                    </div>
                    <button onClick={() => remove(l.id)} className="text-muted-foreground hover:text-foreground" aria-label="Remove listing"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'how' && (
          <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-2xl bg-card p-6 shadow-sm">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold"><ShieldCheck className="h-5 w-5 text-primary" />Listing rules</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>Public events and sales only. Birthday parties, private home gatherings and invitation-only functions are never listed.</li>
                <li>Weekly, fortnightly and monthly events are created once and repeat automatically for up to six months. Renew any time.</li>
                <li>Every listing expires automatically after its last date.</li>
                <li>Each submission is checked for duplicates, a real address, spam and inappropriate content. Anything flagged is reviewed by a person before it goes live.</li>
                <li>No photos are taken from other sites or social media. Listings imported from public event pages show the facts only and link to the original.</li>
                <li>Your contact email is never shown publicly. Three visitor reports send a listing back for review.</li>
                <li>New listings confirm with an email code. The street stays off the public page unless you opt in. School listings are suburb-only, and photos of children are not published.</li>
                <li>After it is confirmed you get a manage link and a printable poster with a QR code.</li>
                <li>No weapons, vapes, prescription medicines, adult services, scams or job and rental ads.</li>
              </ul>
            </div>
            <div className="overflow-x-auto rounded-2xl bg-card p-6 shadow-sm">
              <h2 className="font-display text-xl font-bold">Where listings come from</h2>
              <p className="mt-1 text-sm text-muted-foreground">We don’t scrape private social media events or republish anyone’s images without permission. Public listings show the facts only and always link back to the original page.</p>
              <table className="mt-4 w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="pb-2 pr-3">Source</th><th className="pb-2 pr-3">Best for</th><th className="pb-2">Status</th></tr></thead>
                <tbody>
                  {LOCAL_SOURCES.map((s) => (
                    <tr key={s.name} className="border-t border-border align-top">
                      <td className="py-2 pr-3 font-semibold">{s.url?.startsWith('http') ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{s.name}</a> : s.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{s.bestFor}</td>
                      <td className="py-2 text-muted-foreground">{s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
      <Footer lastRefresh={null} />
    </div>
  )
}
