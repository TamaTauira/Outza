'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Store, Tag, Warehouse, ShoppingBasket, Users, Plus, ShieldCheck, Trash2, MousePointerClick } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { useSaved } from '@/lib/saved'
import { CITY_NAMES, DEFAULT_CITY, cityDef } from '@/lib/cities'
import { readCity, writeCity } from '@/lib/city-pref'
import { LOCAL_CATEGORIES, LOCAL_SOURCES, fmtDay, fmtTime, localPath, localToBoard } from '@/lib/local-shared'
import { GroupBar } from '@/components/board-row'
import { dayLabel } from '@/lib/board'
import { Bookmark } from 'lucide-react'
import { LocalSubmitForm } from './local-submit-form'
import { cn } from '@/lib/utils'
import { citySlug } from '@/lib/seo'

type Item = { id: string; title: string; category: string; description: string; address: string; suburb: string; postcode: string; city: string; startTime: string; endTime: string; priceNote: string | null; organiserName: string; websiteUrl: string | null; date: string; schedule: string; recurring: boolean }
type Mine = Omit<Item, 'date' | 'recurring'> & { status: string; expiresAt: string; flags: string[]; reviewNote: string | null; startDate: string }

const ICON: Record<string, typeof Store> = { GARAGE: Tag, WAREHOUSE: Warehouse, MARKET: ShoppingBasket, COMMUNITY: Users }
const TABS = [{ key: 'browse', label: 'What’s on nearby', short: 'Nearby' }, { key: 'submit', label: 'List something', short: 'List' }, { key: 'mine', label: 'My listings', short: 'Mine' }, { key: 'how', label: 'How VibePeep Local works', short: 'How' }] as const
const WHEN = [{ key: 'today', label: 'Today' }, { key: 'weekend', label: 'This weekend' }, { key: '7', label: 'Next 7 days' }, { key: '30', label: 'Next 30 days' }]
function nowIn(tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) }
}
const pill = (on: boolean) => cn('h-9 px-4 rounded-full text-sm whitespace-nowrap transition-colors', on ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground')

export function LocalClient() {
  const router = useRouter()
  const params = useSearchParams()
  const { saved, isSaved, toggle } = useSaved()
  const { data: session } = useSession() || {}
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'browse') as (typeof TABS)[number]['key']
  const setTab = (t: string) => router.replace(t === 'browse' ? '/local' : `/local?tab=${t}`, { scroll: false })

  const [city, setCityState] = useState(DEFAULT_CITY)
  const setCity = (c: string) => { setCityState(c); writeCity(c) }
  const [loadError, setLoadError] = useState<string | null>(null)
  const [category, setCategory] = useState('')
  const [when, setWhen] = useState('weekend')
  const [data, setData] = useState<{ items: Item[]; counts: Record<string, number> } | null>(null)
  const [mine, setMine] = useState<Mine[] | null>(null)
  const [now, setNow] = useState<{ date: string; minutes: number } | null>(null)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const tick = () => setNow(nowIn(cityDef(city).tz))
    tick()
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [city])

  useEffect(() => {
    const saved = readCity()
    if (saved && CITY_NAMES.includes(saved)) setCityState(saved)
  }, [])

  useEffect(() => {
    if (tab !== 'browse') return
    const ac = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; ac.abort() }, 8000)
    setData(null)
    setLoadError(null)
    fetch(`/api/local?${new URLSearchParams({ city, category, when })}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => { setData(d?.items ? d : { items: [], counts: {} }); setLoadError(null) })
      .catch((e) => {
        console.error(e)
        if (e?.name === 'AbortError' && !timedOut) return
        setData(null)
        setLoadError(timedOut || e?.name === 'AbortError' ? 'Listings are taking too long to load. Nothing is waiting — try again in a moment, or list something yourself.' : 'We couldn’t load local listings just now.')
      })
      .finally(() => clearTimeout(timer))
    return () => { clearTimeout(timer); ac.abort() }
  }, [tab, city, category, when])

  const loadMine = useCallback(() => {
    fetch('/api/local?mine=1').then((r) => (r.ok ? r.json() : { listings: [] })).then((j) => setMine(j.listings ?? [])).catch((e) => { console.error(e); setMine([]) })
  }, [])
  useEffect(() => { if (tab === 'mine' && session?.user) loadMine() }, [tab, session?.user, loadMine])

  const days = useMemo(() => {
    const m = new Map<string, ReturnType<typeof localToBoard>[]>()
    data?.items.forEach((i) => m.set(i.date, [...(m.get(i.date) ?? []), localToBoard(i)]))
    return [...m.entries()]
  }, [data])

  const remove = async (id: string) => {
    if (!confirm('Take this listing down? This removes every upcoming date.')) return
    const res = await fetch(`/api/local/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Listing removed'); loadMine() } else toast.error('Could not remove it')
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={saved.length} />
      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">VibePeep Local</p>
            <h1 className="mt-2 font-display text-3xl sm:text-5xl font-bold tracking-tight">Your neighbourhood, unlocked.</h1>
            <p className="mt-3 text-muted-foreground sm:text-lg">Garage sales, warehouse clearances, markets and community happenings: the good stuff that never makes the big posters. Listing’s free.</p>
          </div>
          <button type="button" onClick={() => setTab('submit')} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />List something</button>
        </header>

        <div className="relative mt-8 min-w-0">
          <div className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:thin]">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={cn('relative shrink-0 px-3 py-3 text-sm whitespace-nowrap sm:px-4', tab === t.key ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground')}>
                <span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span>
                {tab === t.key && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary" />}
              </button>
            ))}
          </div>
        </div>

        {tab === 'browse' && (
          <section className="mt-8">
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {LOCAL_CATEGORIES.map((c) => {
                const Icon = ICON[c.key]
                const on = category === c.key
                return (
                  <button key={c.key} onClick={() => setCategory(on ? '' : c.key)} className={cn('inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')}>
                    <Icon className="h-4 w-4" />
                    <span>{c.short}</span>
                    <span className="font-mono text-[11px] opacity-80">{data ? data.counts[c.key] ?? 0 : '…'}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-4 flex min-w-0 items-center gap-2">
              <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="City" className="h-9 shrink-0 rounded-full border border-border bg-background px-3 text-sm">
                {CITY_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:thin]">{WHEN.map((w) => <button key={w.key} onClick={() => setWhen(w.key)} className={cn(pill(when === w.key), 'shrink-0')}>{w.label}</button>)}</div>
            </div>

            <div className="mt-6 rounded-xl bg-card border border-border overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 sm:px-5 py-2.5 border-b border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-free" />
                  <span className="font-semibold text-foreground">{data ? data.items.length : '…'}</span> local listings · {WHEN.find((w) => w.key === when)?.label.toLowerCase()}
                </div>
                <span className="hidden md:inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground"><MousePointerClick className="w-3 h-3" /> Tap a row for the goods</span>
              </div>
              {!data && !loadError && <p className="px-5 py-16 text-center text-sm text-muted-foreground">Loading local listings…</p>}
              {loadError && (
                <div className="p-8 text-center">
                  <p className="font-display text-lg font-bold">Couldn’t load listings</p>
                  <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
                </div>
              )}
              {data && !loadError && !days.length && (
                <div className="p-8 text-center">
                  <Store className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="mt-3 font-display text-lg font-bold">Nothing listed for {city} {WHEN.find((w) => w.key === when)?.label.toLowerCase()} yet.</p>
                  <p className="mt-1 text-sm text-muted-foreground">Running a garage sale, clearance, market or community activity? Be the trailblazer.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button onClick={() => setTab('submit')} className="h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5"><Plus className="w-4 h-4" />List It Free</button>
                    <Link href={`/${citySlug(city)}/markets`} className="h-10 px-5 rounded-full bg-muted text-sm inline-flex items-center">Markets on the Board</Link>
                  </div>
                </div>
              )}
              {days.map(([day, rows]) => {
                const open = !closed[day]
                return (
                  <section key={day}>
                    <GroupBar label={dayLabel(day, now?.date ?? null)} count={rows.length} open={open} onToggle={() => setClosed((c) => ({ ...c, [day]: open }))} />
                    {open && (
                      <div className="grid gap-3 p-3 sm:grid-cols-2">
                        {rows.map((ev) => {
                          const free = ev.isFree || /free/i.test(ev.price ?? '')
                          return (
                            <div key={ev.id} className="rounded-xl border border-border bg-background p-4">
                              <div className="flex items-start justify-between gap-2">
                                <Link href={ev.href ?? `/local`} className="font-semibold leading-snug hover:text-primary">{ev.title}</Link>
                                <button type="button" onClick={() => toggle(ev)} aria-label={isSaved(ev.id) ? 'Remove from saved' : 'Save'} className={cn('shrink-0', isSaved(ev.id) ? 'text-primary' : 'text-muted-foreground')}>
                                  <Bookmark className={cn('h-4 w-4', isSaved(ev.id) && 'fill-current')} />
                                </button>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">{[ev.suburb, ev.time].filter(Boolean).join(' · ')}</p>
                              <div className="mt-2 flex items-center gap-2 text-xs">
                                {free && <span className="rounded-full bg-emerald-700 px-2 py-0.5 font-bold text-white">Free</span>}
                                {!free && ev.price && <span className="font-mono">{ev.price}</span>}
                                <span className="text-muted-foreground">{ev.category}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          </section>
        )}

        {tab === 'submit' && <LocalSubmitForm defaultCity={city} signedIn={!!session?.user} defaultEmail={session?.user?.email ?? ''} onDone={() => setTab(session?.user ? 'mine' : 'browse')} />}

        {tab === 'mine' && (
          <section className="mt-8 max-w-3xl">
            {!session?.user ? (
              <p className="text-sm text-muted-foreground"><Link href="/login?next=/local?tab=mine" className="text-primary underline">Sign in</Link> to see and manage the listings you’ve added.</p>
            ) : !mine ? <p className="text-sm text-muted-foreground">Loading…</p> : !mine.length ? (
              <p className="text-sm text-muted-foreground">Nothing here yet. Be the trailblazer. <button onClick={() => setTab('submit')} className="text-primary underline">List something</button></p>
            ) : (
              <div className="space-y-3">
                {mine.map((l) => (
                  <div key={l.id} className="rounded-2xl bg-card shadow-sm p-5 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      {l.status === 'APPROVED' ? <Link href={localPath(l)} className="font-display font-bold hover:text-primary">{l.title}</Link> : <p className="font-display font-bold">{l.title}</p>}
                      <p className="text-sm text-muted-foreground">{l.schedule} · from {fmtDay(l.startDate)} · {fmtTime(l.startTime)}–{fmtTime(l.endTime)} · {l.suburb}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Shows until {new Date(l.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' })}</p>
                      <span className={cn('mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', l.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : l.status === 'PENDING' ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800')}>
                        {l.status === 'APPROVED' ? 'Live' : l.status === 'PENDING' ? 'Being checked' : 'Not approved'}
                      </span>
                    </div>
                    <button onClick={() => remove(l.id)} className="text-muted-foreground hover:text-foreground" aria-label="Remove listing"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'how' && (
          <section className="mt-8 grid lg:grid-cols-[1fr_1.2fr] gap-6">
            <div className="rounded-2xl bg-card shadow-sm p-6">
              <h2 className="font-display text-xl font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" />Listing rules</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground list-disc pl-5 leading-relaxed">
                <li>Public events and sales only. Birthday parties, private home gatherings and invitation-only functions are never listed.</li>
                <li>Weekly, fortnightly and monthly events are created once and repeat automatically for up to six months. Renew any time.</li>
                <li>Every listing expires automatically after its last date.</li>
                <li>Each submission is checked for duplicates, a real address, spam and inappropriate content. Anything flagged is reviewed by a person before it goes live.</li>
                <li>No photos are taken from other sites or social media. Listings imported from public event pages show the facts only and link to the original.</li>
                <li>Your contact email is never shown publicly. Three visitor reports send a listing back for review.</li>
                <li>No weapons, vapes, prescription medicines, adult services, scams or job and rental ads.</li>
              </ul>
            </div>
            <div className="rounded-2xl bg-card shadow-sm p-6 overflow-x-auto">
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
