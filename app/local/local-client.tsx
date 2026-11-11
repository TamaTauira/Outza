'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { ShieldCheck, Trash2 } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { type LocalMapPin } from '@/components/local-neighbourhood-map'
import { LocalBrowse, type LocalItem } from './local-browse'
import { useSaved } from '@/lib/saved'
import { CITY_NAMES, DEFAULT_CITY, cityDef } from '@/lib/cities'
import { readCity, writeCity } from '@/lib/city-pref'
import { LOCAL_SOURCES, fmtDay, fmtTime, localPath } from '@/lib/local-shared'
import { sectionByKey } from '@/lib/community-shared'
import { CommunitySubmitForm } from './community-submit-form'
import { cn } from '@/lib/utils'
import { holdScrollRestore } from '@/lib/scroll-memory'

type Item = LocalItem
type Mine = { id: string; title: string; suburb: string; status: string; expiresAt: string; reviewNote: string | null; startDate: string; startTime: string; endTime: string; schedule: string }
type MineCommunity = { id: string; title: string; suburb: string | null; city: string; communityKey: string | null; approvalState: string | null; status: string; href: string }

const TABS = [{ key: 'browse', label: 'What’s on nearby', short: 'Nearby' }, { key: 'submit', label: 'List something', short: 'List' }, { key: 'mine', label: 'My listings', short: 'Mine' }, { key: 'how', label: 'How VibePeep Local works', short: 'How' }] as const

function nowIn(tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) }
}

const rowKey = (ev: Item) => `${ev.kind ?? 'row'}:${ev.id}:${ev.date}`

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
  const [weekend, setWeekend] = useState<Item[] | null>(null)

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
          setLoadError({ key, message: 'Local list didn’t load. Try again in a tick.' })
          return
        }
        setData({ key, items: d?.items ?? [], counts: d?.counts ?? {} })
        setLoadError(null)
      })
      .catch((e) => {
        console.error(e)
        if (requestRef.current !== ticket || (e?.name === 'AbortError' && !timedOut)) return
        setData(null)
        setLoadError({ key, message: timedOut || e?.name === 'AbortError' ? 'This is taking ages. Try again, or be the first to list something.' : 'Local list didn’t load. Try again in a tick.' })
      })
      .finally(() => { clearTimeout(timer); release() })
    return () => { clearTimeout(timer); ac.abort(); release() }
  }, [tab, city, category, when, suburbQuery, requestKey])

  useEffect(() => {
    if (tab !== 'browse') return
    const ac = new AbortController()
    fetch(`/api/local?${new URLSearchParams({ city, category, when: 'weekend', suburb: suburbQuery })}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => setWeekend(d?.notice && !d?.items?.length ? [] : d?.items ?? []))
      .catch((e) => { if (e?.name !== 'AbortError') setWeekend([]) })
    return () => ac.abort()
  }, [tab, city, category, suburbQuery])

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

  const save = (ev: Item) => toggle({
    id: ev.id,
    title: ev.title,
    description: ev.blurb ?? null,
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
  }, 'local')

  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={saved.length} />
      <main className="vp-wrap min-w-0 px-4 py-6 sm:px-6 lg:py-8">
        <div className="relative min-w-0">
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
          <LocalBrowse
            city={city}
            setCity={setCity}
            suburb={suburb}
            setSuburb={setSuburb}
            applySuburb={(value) => { setSuburb(value); setSuburbQuery(value) }}
            category={category}
            setCategory={setCategory}
            when={when}
            setWhen={setWhen}
            items={view ? view.items : null}
            error={error}
            days={days}
            pins={pins}
            weekend={weekend}
            today={now?.date ?? null}
            hotKey={hotKey}
            setHotKey={setHotKey}
            focusKey={focusKey}
            focusPin={focusPin}
            closed={closed}
            setClosed={setClosed}
            more={more}
            setMore={setMore}
            isSaved={isSaved}
            save={save}
            onList={() => setTab('submit')}
          />
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
