'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, BadgeCheck, BarChart3, Brain, CalendarPlus, Eye, FileText, Loader2, Lock, Mail, Megaphone, MousePointerClick, Pencil, Receipt, Rocket, Search, Share2, Sparkles, Store, Users, Wallet } from 'lucide-react'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { REFERRAL_LABELS, REFERRAL_SOURCES } from '@/lib/referral-labels'
import { PRO_PLAN, TIER_KEYS, formatAud, productName, tierDef } from '@/lib/tiers'
import { CATEGORIES } from '@/lib/categories'
import { CITIES } from '@/lib/cities'
import { cn } from '@/lib/utils'
import { CampaignBuilder } from './campaign-builder'
import { LocalAdsTab } from './local-ads-tab'
import { EditEventPanel } from './edit-event-panel'
import { AudienceCard } from './audience-card'
import { IntelTab } from './intel-tab'

type Promo = { id: string; tier: string; days?: number | null; orderId?: string | null; status: string; amountCents: number; paymentMode: string; endsAt?: string | null; createdAt: string }
type MyEvent = {
  id: string; title: string; date: string; city?: string; venueName: string; views?: number; ticketClicks?: number; promotions?: Promo[]; _count?: { savedBy: number; attendees: number }
  time?: string | null; endTime?: string | null; venueAddress?: string | null; price?: string | null; isFree?: boolean; ticketUrl?: string | null; imageUrl?: string | null; description?: string | null
  organiserName?: string | null; organiserUrl?: string | null; accessibilityInfo?: string | null; ageRestriction?: string | null; transportInfo?: string | null; organiserEditedAt?: string | null
  referrals?: { source: string; count: number }[]
}
type Pass = { id: string; status: string; amountCents: number; paymentMode: string; endsAt?: string | null; createdAt: string }
type Account = { pro: boolean; proUntil: string | null; displayName: string; weeklyReport?: boolean; lastReportAt?: string | null }
type Tab = 'overview' | 'intel' | 'promote' | 'events' | 'local' | 'billing'

const card = 'rounded-xl bg-card border border-border p-5 shadow-sm'
const field = 'h-10 rounded-md border border-border bg-background px-3 text-sm w-full'
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
const isLive = (p: Promo) => p.status === 'ACTIVE' && !!p.endsAt && new Date(p.endsAt) > new Date()

const TABS: { key: Tab; label: string; Icon: typeof Rocket }[] = [
  { key: 'overview', label: 'Overview', Icon: BarChart3 },
  { key: 'intel', label: 'Intelligence', Icon: Brain },
  { key: 'promote', label: 'Promote an event', Icon: Rocket },
  { key: 'events', label: 'My events', Icon: CalendarPlus },
  { key: 'local', label: 'Local business ads', Icon: Store },
  { key: 'billing', label: 'Pro & billing', Icon: Receipt },
]

export function PromoterClient({ stripeEnabled }: { stripeEnabled: boolean }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [events, setEvents] = useState<MyEvent[]>([])
  const [account, setAccount] = useState<Account>({ pro: false, proUntil: null, displayName: '' })
  const [passes, setPasses] = useState<Pass[]>([])
  const [loading, setLoading] = useState(true)
  const [promoteId, setPromoteId] = useState('')
  const [proBusy, setProBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await fetch('/api/promoter/events').then((r) => r.json())
      setEvents(d?.events ?? []); setPasses(d?.passes ?? [])
      if (d?.account) setAccount(d.account)
    } catch (err) { console.error('Failed to load promoter dashboard:', err) } finally { setLoading(false) }
  }, [])
  useEffect(() => {
    load()
    const p = new URLSearchParams(window.location.search)
    if (p.get('paid')) toast.success('Payment received — your campaign is live!')
    if (p.get('pro')) toast.success(`Welcome to ${PRO_PLAN.name}!`)
    if (p.get('cancelled')) toast('Checkout cancelled — nothing was charged')
    const t = p.get('tab') as Tab | null
    if (t && TABS.some((x) => x.key === t)) setTab(t)
    const ev = p.get('event')
    if (ev) { setPromoteId(ev); if (!t) setTab('promote') }
  }, [load])

  const stats = useMemo(() => {
    const all = events.flatMap((e) => e.promotions ?? [])
    return {
      live: new Set(all.filter((p) => isLive(p) && TIER_KEYS.includes(p.tier as never)).map((p) => p.id)).size,
      views: events.reduce((s, e) => s + (e.views ?? 0), 0),
      clicks: events.reduce((s, e) => s + (e.ticketClicks ?? 0), 0),
      fans: events.reduce((s, e) => s + (e._count?.savedBy ?? 0) + (e._count?.attendees ?? 0), 0),
      spend: all.filter((p) => p.status === 'ACTIVE' || p.status === 'EXPIRED').reduce((s, p) => s + p.amountCents, 0) + passes.filter((p) => p.status === 'ACTIVE').reduce((s, p) => s + p.amountCents, 0),
    }
  }, [events, passes])

  const startPromote = (id?: string) => { if (id) setPromoteId(id); setTab('promote'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const buyPro = async () => {
    setProBusy(true)
    try {
      const res = await fetch('/api/promotions/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: 'PRO' }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Checkout failed')
      if (d.url) { window.location.href = d.url; return }
      toast.success(`${PRO_PLAN.name} activated (test mode — no card charged)`); load()
    } catch (err) { console.error('Pro checkout failed:', err); toast.error(err instanceof Error ? err.message : 'Checkout failed') } finally { setProBusy(false) }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <BackToEventsLink className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to events</BackToEventsLink>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">Promoter dashboard</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-1 flex items-center gap-2">
            {account.displayName ? account.displayName : 'Promoter dashboard'}
            {account.pro && <BadgeCheck className="w-7 h-7 text-primary" aria-label="Verified promoter" />}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Your events, your campaigns, your results. No spreadsheet required.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/promoters" className="h-10 px-4 rounded-md border border-border text-sm font-medium flex items-center hover:bg-muted">View Pricing</Link>
          <button onClick={() => startPromote()} className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2"><Rocket className="w-4 h-4" />Promote an Event</button>
        </div>
      </div>
      {!stripeEnabled && <div className="mt-5 rounded-lg border border-primary/60 px-4 py-3 text-sm text-primary">Payments are in test mode — campaigns and Pro activate instantly without charging a card.</div>}

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]" aria-label="Dashboard sections">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={cn('relative shrink-0 flex items-center gap-2 px-4 h-11 text-sm transition-colors', tab === key ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground')}>
            <Icon className="w-4 h-4" />{label}
            {tab === key && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary" />}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : (
          <>
            {tab === 'overview' && <Overview stats={stats} account={account} events={events} onPromote={startPromote} onPro={buyPro} proBusy={proBusy} goEvents={() => setTab('events')} onAccount={(a) => setAccount({ ...account, ...a })} />}
            {tab === 'promote' && (
              <section className={card}>
                <h2 className="font-display text-xl font-bold mb-1">Build a campaign</h2>
                <p className="text-sm text-muted-foreground mb-6">Four quick steps. Your campaign starts the moment payment is confirmed.</p>
                <CampaignBuilder events={events} pro={account.pro} stripeEnabled={stripeEnabled} eventId={promoteId} onEventChange={setPromoteId} onDone={() => { load(); setTab('events') }} />
              </section>
            )}
            {tab === 'events' && <EventsTab events={events} pro={account.pro} onPromote={startPromote} reload={load} />}
            {tab === 'intel' && <IntelTab events={events} />}
            {tab === 'local' && <LocalAdsTab />}
            {tab === 'billing' && <Billing events={events} passes={passes} account={account} onPro={buyPro} proBusy={proBusy} />}
          </>
        )}
      </div>
    </main>
  )
}

function Kpi({ Icon, label, value, hint }: { Icon: typeof Eye; label: string; value: string; hint?: string }) {
  return (
    <div className={card}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs"><Icon className="w-4 h-4 text-primary" />{label}</div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

function ProCard({ account, onPro, proBusy }: { account: Account; onPro: () => void; proBusy: boolean }) {
  return (
    <div className="rounded-xl p-5 shadow-sm bg-gradient-to-br from-primary/20 via-card to-card border border-primary/40">
      <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /><p className="font-semibold">{PRO_PLAN.name}</p></div>
      {account.pro ? (
        <p className="text-sm mt-2">Active until <strong>{fmt(account.proUntil)}</strong>. You&apos;re saving {PRO_PLAN.discountPct}% on every campaign.</p>
      ) : (
        <p className="text-2xl font-bold mt-2">{formatAud(PRO_PLAN.priceCents)}<span className="text-xs font-normal text-muted-foreground"> / {PRO_PLAN.days} days</span></p>
      )}
      <ul className="mt-3 space-y-1.5">{PRO_PLAN.perks.map((p) => <li key={p} className="text-xs text-muted-foreground flex gap-1.5"><BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0 mt-px" />{p}</li>)}</ul>
      <button onClick={onPro} disabled={proBusy} className="mt-4 w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
        {proBusy && <Loader2 className="w-4 h-4 animate-spin" />}{account.pro ? 'Extend 30 days' : 'Go Pro'}
      </button>
    </div>
  )
}

const unlockedFor = (e: MyEvent, pro: boolean) => pro || !!e.promotions?.some((p) => p.status === 'ACTIVE' || p.status === 'EXPIRED')

function ReferralBars({ referrals }: { referrals: { source: string; count: number }[] }) {
  const total = referrals.reduce((s, r) => s + r.count, 0)
  if (!total) return <p className="text-xs text-muted-foreground">No tracked visits yet. Sources appear here as people open your event pages.</p>
  return (
    <ul className="space-y-2">
      {REFERRAL_SOURCES.map((s) => ({ s, c: referrals.filter((r) => r.source === s).reduce((a, r) => a + r.count, 0) })).filter((x) => x.c).sort((a, b) => b.c - a.c).map(({ s, c }) => (
        <li key={s} className="text-xs">
          <div className="flex justify-between"><span>{REFERRAL_LABELS[s]}</span><span className="tabular-nums text-muted-foreground">{c.toLocaleString('en-AU')} · {Math.round((c / total) * 100)}%</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(3, (c / total) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

function ReportsCard({ account, onAccount }: { account: Account; onAccount: (a: Partial<Account>) => void }) {
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const sendNow = async () => {
    setSending(true)
    try {
      const res = await fetch('/api/promoter/report', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Could not send report')
      toast.success('Report sent. Check your inbox'); onAccount({ lastReportAt: new Date().toISOString() })
    } catch (err) { console.error('Report failed:', err); toast.error(err instanceof Error ? err.message : 'Could not send report') } finally { setSending(false) }
  }
  const toggle = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/promoter/report', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ weeklyReport: !account.weeklyReport }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Could not update')
      onAccount({ weeklyReport: d.weeklyReport }); toast.success(d.weeklyReport ? 'Weekly reports on' : 'Weekly reports off')
    } catch (err) { console.error('Weekly report toggle failed:', err); toast.error(err instanceof Error ? err.message : 'Could not update') } finally { setSaving(false) }
  }
  return (
    <div className={card}>
      <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /><p className="font-semibold text-sm">Emailed performance reports</p></div>
      <p className="text-xs text-muted-foreground mt-1">Views, ticket clicks, saves and traffic sources for your events, sent to your account email.</p>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span id="weekly-report-label">Weekly report</span>
        <button type="button" role="switch" aria-labelledby="weekly-report-label" aria-checked={!!account.weeklyReport} onClick={toggle} disabled={saving}
          className={cn('relative w-10 h-6 rounded-full transition-colors disabled:opacity-60', account.weeklyReport ? 'bg-primary' : 'bg-muted border border-border')}>
          <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', account.weeklyReport ? 'left-[18px]' : 'left-0.5')} />
        </button>
      </div>
      <button onClick={sendNow} disabled={sending} className="mt-3 w-full h-9 rounded-md border border-border text-sm font-medium flex items-center justify-center gap-2 hover:bg-muted disabled:opacity-60">
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}Email me a report now
      </button>
      {account.lastReportAt && <p className="text-[11px] text-muted-foreground mt-2">Last sent {fmt(account.lastReportAt)}</p>}
    </div>
  )
}

function Overview({ stats, account, events, onPromote, onPro, proBusy, goEvents, onAccount }: {
  stats: { live: number; views: number; clicks: number; fans: number; spend: number }; account: Account; events: MyEvent[]
  onPromote: (id?: string) => void; onPro: () => void; proBusy: boolean; goEvents: () => void; onAccount: (a: Partial<Account>) => void
}) {
  const referrals = events.filter((e) => unlockedFor(e, account.pro)).flatMap((e) => e.referrals ?? [])
  const anyUnlocked = events.some((e) => unlockedFor(e, account.pro))
  const steps = [
    { Icon: CalendarPlus, title: 'Add your event', body: 'Claim a listing we already have, or create a new one in seconds.', action: goEvents, cta: 'Add an event' },
    { Icon: Megaphone, title: 'Choose a package', body: 'Boost, Spotlight or Headliner for 7, 14 or 30 days, plus optional add-ons.', action: () => onPromote(), cta: 'Build a campaign' },
    { Icon: BarChart3, title: 'Track the results', body: 'Watch views, ticket clicks, saves and RSVPs grow right here.', action: goEvents, cta: 'See my events' },
  ]
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi Icon={Rocket} label="Live campaigns" value={String(stats.live)} />
        <Kpi Icon={Eye} label="Listing views" value={stats.views.toLocaleString('en-AU')} hint="Event page visits" />
        <Kpi Icon={MousePointerClick} label="Ticket clicks" value={stats.clicks.toLocaleString('en-AU')} hint={stats.views ? `${((stats.clicks / stats.views) * 100).toFixed(1)}% click-through` : 'Taps on “Get Tickets”'} />
        <Kpi Icon={Users} label="Saves + going" value={stats.fans.toLocaleString('en-AU')} />
        <Kpi Icon={Wallet} label="Total invested" value={formatAud(stats.spend)} hint="AUD, all time" />
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <section className={card}>
          <h2 className="font-semibold mb-4">How it works</h2>
          <ol className="grid sm:grid-cols-3 gap-4">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-lg bg-background border border-border p-4 flex flex-col">
                <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{i + 1}</span><s.Icon className="w-4 h-4 text-primary" /></div>
                <p className="font-semibold text-sm mt-3">{s.title}</p>
                <p className="text-xs text-muted-foreground mt-1 flex-1">{s.body}</p>
                <button onClick={s.action} className="mt-3 text-xs font-semibold text-primary text-left hover:underline">{s.cta} →</button>
              </li>
            ))}
          </ol>
          {events.length > 0 && (
            <>
              <h3 className="font-semibold text-sm mt-6 mb-2">Your next events</h3>
              <div className="divide-y divide-border">
                {events.filter((e) => new Date(e.date).getTime() >= Date.now() - 86400000).slice(0, 4).map((e) => {
                  const live = e.promotions?.find((p) => isLive(p) && tierDef(p.tier))
                  return (
                    <div key={e.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate"><Link href={`/events/${e.id}`} className="font-medium hover:text-primary">{e.title}</Link> <span className="text-muted-foreground text-xs">· {fmt(e.date)}</span></span>
                      {live ? <TierBadge tier={live.tier} /> : <button onClick={() => onPromote(e.id)} className="shrink-0 text-xs font-semibold text-primary hover:underline">Promote</button>}
                    </div>
                  )
                })}
              </div>
            </>
          )}
          <h3 className="font-semibold text-sm mt-6 mb-3 flex items-center gap-2"><Share2 className="w-4 h-4 text-primary" />Where your visitors come from</h3>
          {anyUnlocked ? <ReferralBars referrals={referrals} /> : <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />Traffic sources unlock for promoted events, or for every event with {PRO_PLAN.name}.</p>}
        </section>
        <div className="space-y-6">
          <ProCard account={account} onPro={onPro} proBusy={proBusy} />
          <ReportsCard account={account} onAccount={onAccount} />
        </div>
      </div>

      <AudienceCard />
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const t = tierDef(tier)
  return <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-black" style={{ backgroundColor: t?.color ?? '#f9652a' }}>{(t?.name ?? productName(tier)).toUpperCase()}</span>
}

function EventsTab({ events, pro, onPromote, reload }: { events: MyEvent[]; pro: boolean; onPromote: (id: string) => void; reload: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<MyEvent[]>([])
  const [searching, setSearching] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', date: '', time: '', venueName: '', venueAddress: '', city: 'Sydney', category: CATEGORIES[0]?.name ?? '', price: '', isFree: false, ticketUrl: '', imageUrl: '', description: '', endTime: '', galleryUrls: '', organiserName: '', organiserUrl: '', accessibilityInfo: '', ageRestriction: '', transportInfo: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value })

  const search = async (e: React.FormEvent) => {
    e.preventDefault(); setSearching(true)
    const d = await fetch(`/api/events?search=${encodeURIComponent(q)}&limit=20`).then((r) => r.json()).catch((err) => { console.error('Search failed:', err); return {} })
    setResults(d?.events ?? []); setSearching(false)
  }
  const claim = async (eventId: string) => {
    const res = await fetch('/api/promoter/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId }) })
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      toast.success(d?.status === 'APPROVED' ? 'Verified. Event added to your dashboard' : 'Claim sent. We\'ll verify you\'re the organiser and add it to your dashboard')
      setResults((r) => r.filter((x) => x.id !== eventId)); reload()
    } else toast.error(d?.error ?? 'Could not claim event')
  }
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/promoter/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
    const d = await res.json().catch(() => ({}))
    if (res.ok) { toast.success('Event created — you can promote it now'); setForm({ ...form, title: '', description: '', imageUrl: '' }); reload() } else toast.error(d?.error ?? 'Could not create event')
  }

  return (
    <div className="space-y-6">
      <section className={card}>
        <h2 className="font-semibold mb-1">My events</h2>
        <p className="text-xs text-muted-foreground mb-4">{pro ? 'Pro analytics are on for all your events.' : 'Views and ticket clicks unlock for promoted events, or for every event with Promoter Pro.'}</p>
        {!events.length ? <p className="text-sm text-muted-foreground">Empty stage. Claim a listing or create an event to get going.</p> : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm min-w-[720px]">
              <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="font-medium px-5 py-2">Event</th><th className="font-medium px-3">Status</th><th className="font-medium px-3 text-right">Views</th><th className="font-medium px-3 text-right">Ticket clicks</th><th className="font-medium px-3 text-right">Saves / going</th><th className="px-5" />
              </tr></thead>
              <tbody className="divide-y divide-border">
                {events.map((ev) => {
                  const liveTier = ev.promotions?.filter((p) => isLive(p) && tierDef(p.tier)).sort((a, b) => (tierDef(b.tier)!.priceCents - tierDef(a.tier)!.priceCents))[0]
                  const liveAddons = ev.promotions?.filter((p) => isLive(p) && !tierDef(p.tier)) ?? []
                  const unlocked = pro || !!ev.promotions?.some((p) => p.status === 'ACTIVE' || p.status === 'EXPIRED')
                  const past = new Date(ev.date).getTime() < Date.now() - 86400000
                  return (
                    <Fragment key={ev.id}>
                    <tr className="align-top">
                      <td className="px-5 py-3 min-w-0">
                        <Link href={`/events/${ev.id}`} className="font-medium hover:text-primary">{ev.title}</Link>
                        <p className="text-xs text-muted-foreground">{fmt(ev.date)} · {ev.venueName}{ev.city ? ` · ${ev.city}` : ''}</p>
                        {ev.organiserEditedAt && <p className="text-[11px] text-muted-foreground mt-0.5">Edited by you {fmt(ev.organiserEditedAt)}</p>}
                      </td>
                      <td className="px-3 py-3">
                        {past ? <span className="text-xs text-muted-foreground">Finished</span> : liveTier ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1"><TierBadge tier={liveTier.tier} />{liveAddons.map((a) => <span key={a.id} className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-primary/15 text-primary">{productName(a.tier).toUpperCase()}</span>)}</div>
                            <p className="text-[11px] text-muted-foreground">until {fmt(liveTier.endsAt)}</p>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">Not promoted</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{unlocked ? (ev.views ?? 0).toLocaleString('en-AU') : <Lock className="w-3.5 h-3.5 inline text-muted-foreground" aria-label="Locked" />}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{unlocked ? (ev.ticketClicks ?? 0).toLocaleString('en-AU') : <Lock className="w-3.5 h-3.5 inline text-muted-foreground" aria-label="Locked" />}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{ev._count?.savedBy ?? 0} / {ev._count?.attendees ?? 0}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditing(editing === ev.id ? null : ev.id)} className="h-8 px-3 rounded-md border border-border text-xs font-medium flex items-center gap-1 hover:bg-muted"><Pencil className="w-3.5 h-3.5" />Edit</button>
                          {!past && <button onClick={() => onPromote(ev.id)} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold">{liveTier ? 'Boost' : 'Promote'}</button>}
                        </div>
                      </td>
                    </tr>
                    {editing === ev.id && (
                      <tr><td colSpan={6} className="px-5 pb-4"><EditEventPanel event={ev} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} /></td></tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className={card}>
          <h2 className="font-semibold mb-1">Already listed? Claim it</h2>
          <p className="text-xs text-muted-foreground mb-3">We list thousands of events automatically. Find yours and add it to your dashboard.</p>
          <form onSubmit={search} className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Event name or venue" className={field} aria-label="Search listings" />
            <button className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2">{searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search</button>
          </form>
          <div className="mt-2">
            {results.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm border-b border-border last:border-0">
                <span className="truncate">{r.title} <span className="text-muted-foreground">· {fmt(r.date)} · {r.venueName}</span></span>
                <button onClick={() => claim(r.id)} className="shrink-0 h-8 px-3 rounded-md border border-border text-xs hover:bg-muted">Claim</button>
              </div>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold mb-1">Create a new event</h2>
          <p className="text-xs text-muted-foreground mb-3">Your event goes live on the board straight away.</p>
          <form onSubmit={create} className="grid sm:grid-cols-2 gap-3">
            <input required value={form.title} onChange={set('title')} placeholder="Event title" className={`${field} sm:col-span-2`} />
            <input required type="date" value={form.date} onChange={set('date')} className={field} aria-label="Date" />
            <div className="grid grid-cols-2 gap-2">
              <input type="time" value={form.time} onChange={set('time')} className={field} aria-label="Start time" title="Start time" />
              <input type="time" value={form.endTime} onChange={set('endTime')} className={field} aria-label="Finish time" title="Finish time" />
            </div>
            <input required value={form.venueName} onChange={set('venueName')} placeholder="Venue" className={field} />
            <input value={form.venueAddress} onChange={set('venueAddress')} placeholder="Address" className={field} />
            <select value={form.city} onChange={set('city')} className={field} aria-label="City">{CITIES.map((c) => <option key={c.name}>{c.name}</option>)}</select>
            <select value={form.category} onChange={set('category')} className={field} aria-label="Category">{CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}</select>
            <input value={form.price} onChange={set('price')} placeholder="Price e.g. $25" disabled={form.isFree} className={field} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isFree} onChange={set('isFree')} /> Free event</label>
            <input value={form.ticketUrl} onChange={set('ticketUrl')} placeholder="Ticket link (https://...)" className={`${field} sm:col-span-2`} />
            <input value={form.imageUrl} onChange={set('imageUrl')} placeholder="Image link (https://...) — optional" className={`${field} sm:col-span-2`} />
            <textarea value={form.description} onChange={set('description')} placeholder="Description" rows={3} className="sm:col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <details className="sm:col-span-2 rounded-md border border-border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">Visitor details (optional) — shown on your event page</summary>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <input value={form.organiserName} onChange={set('organiserName')} placeholder="Organiser name" className={field} />
                <input value={form.organiserUrl} onChange={set('organiserUrl')} placeholder="Organiser website (https://…)" className={field} />
                <input value={form.ageRestriction} onChange={set('ageRestriction')} placeholder="Age restriction e.g. 18+, All ages" className={field} />
                <input value={form.galleryUrls} onChange={set('galleryUrls')} placeholder="More image links, comma-separated" className={field} />
                <textarea value={form.accessibilityInfo} onChange={set('accessibilityInfo')} placeholder="Accessibility e.g. step-free entry, accessible toilets, Auslan" rows={2} className="sm:col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm" />
                <textarea value={form.transportInfo} onChange={set('transportInfo')} placeholder="Getting there e.g. nearest station, parking, drop-off" rows={2} className="sm:col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </details>
            <button className="sm:col-span-2 h-10 rounded-md bg-primary text-primary-foreground font-semibold text-sm">Create event</button>
          </form>
        </section>
      </div>
    </div>
  )
}

function Billing({ events, passes, account, onPro, proBusy }: { events: MyEvent[]; passes: Pass[]; account: Account; onPro: () => void; proBusy: boolean }) {
  const rows = useMemo(() => {
    const orders = new Map<string, { id: string; date: string; title: string; items: string[]; cents: number; status: string; test: boolean; endsAt?: string | null }>()
    for (const e of events) for (const p of e.promotions ?? []) {
      if (p.status === 'PENDING') continue
      const key = p.orderId ?? p.id
      const o = orders.get(key) ?? { id: key, date: p.createdAt, title: e.title, items: [], cents: 0, status: p.status, test: p.paymentMode === 'test', endsAt: p.endsAt }
      o.items.push(`${productName(p.tier)}${p.days ? ` · ${p.days}d` : ''}`); o.cents += p.amountCents
      if (tierDef(p.tier)) { o.status = p.status; o.endsAt = p.endsAt }
      orders.set(key, o)
    }
    for (const p of passes) orders.set(p.id, { id: p.id, date: p.createdAt, title: PRO_PLAN.name, items: ['30-day membership'], cents: p.amountCents, status: p.status, test: p.paymentMode === 'test', endsAt: p.endsAt })
    return [...orders.values()].sort((a, b) => +new Date(b.date) - +new Date(a.date))
  }, [events, passes])
  const statusLabel = (r: (typeof rows)[number]) => (r.status === 'CANCELLED' ? 'Cancelled' : r.endsAt && new Date(r.endsAt) > new Date() ? 'Active' : 'Completed')

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <section className={card}>
        <h2 className="font-semibold mb-4">Billing history</h2>
        {!rows.length ? <p className="text-sm text-muted-foreground">No purchases yet.</p> : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm min-w-[600px]">
              <thead><tr className="text-left text-xs text-muted-foreground border-b border-border"><th className="font-medium px-5 py-2">Date</th><th className="font-medium px-3">Description</th><th className="font-medium px-3">Status</th><th className="font-medium px-3 text-right">Amount</th><th className="font-medium px-5 text-right">Invoice</th></tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-5 py-3 whitespace-nowrap">{fmt(r.date)}</td>
                    <td className="px-3 py-3"><p className="font-medium">{r.title}</p><p className="text-xs text-muted-foreground">{r.items.join(' + ')}</p></td>
                    <td className="px-3 py-3"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', statusLabel(r) === 'Active' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>{statusLabel(r)}</span>{r.test && <span className="ml-1.5 text-[10px] text-muted-foreground">test</span>}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium">{formatAud(r.cents)}</td>
                    <td className="px-5 py-3 text-right"><Link href={`/promoter/invoice/${encodeURIComponent(r.id)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><FileText className="w-3.5 h-3.5" />View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-4">Prices in AUD, GST inclusive. Open any invoice to print it or save it as a PDF.</p>
      </section>
      <ProCard account={account} onPro={onPro} proBusy={proBusy} />
    </div>
  )
}
