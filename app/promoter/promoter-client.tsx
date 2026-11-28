'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { BadgeCheck, BarChart3, Brain, CalendarPlus, Download, Eye, FileText, LineChart, Loader2, Lock, Mail, Megaphone, MousePointerClick, Pencil, Receipt, Rocket, Search, Share2, Sparkles, Store, Trash2, Users, Wallet } from 'lucide-react'
import { REFERRAL_LABELS, REFERRAL_SOURCES } from '@/lib/referral-labels'
import { auToIso } from '@/lib/au-date'
import { applyListingField, listingPayloadPrice } from '@/lib/promoter-listing'
import { PROMOTER_NAV_EVENT, promoterTabHref } from '@/lib/promoter-nav'
import { PRO_PLAN, TIER_KEYS, formatAud, isDuration, productName, tierDef, type Duration } from '@/lib/tiers'
import { PAYMENTS_COPY } from '@/lib/payments-mode'
import { finishTimeError } from '@/lib/promoter-listing'
import { CATEGORIES } from '@/lib/categories'
import { boardDisplayName, CITIES } from '@/lib/cities'
import { BRAND_ORANGE } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { CampaignBuilder } from './campaign-builder'
import { LocalAdsTab } from './local-ads-tab'
import { EditEventPanel } from './edit-event-panel'
import { promoterCanEditEvent } from '@/lib/quality'
import { AudienceCard } from './audience-card'
import { IntelTab } from './intel-tab'
import { BoostStudio } from './boost-studio'
import { OrganiserPlans } from './organiser-plans'
import { InsightsPanel } from './insights-panel'
import { PromoterTermsCheck } from '@/components/promoter-terms-check'
import { endCampaignConfirm } from '@/lib/promotion-end'

type Promo = { id: string; tier: string; days?: number | null; orderId?: string | null; status: string; amountCents: number; paymentMode: string; endsAt?: string | null; createdAt: string }
type MyEvent = {
  id: string; title: string; date: string; endDate?: string | null; city?: string; venueName: string; suburb?: string | null; views?: number; ticketClicks?: number; reactionCount?: number; promotions?: Promo[]; _count?: { savedBy: number; attendees: number }
  time?: string | null; endTime?: string | null; venueAddress?: string | null; price?: string | null; isFree?: boolean; isLGBTI?: boolean; category?: string; subTags?: string[]; ticketUrl?: string | null; imageUrl?: string | null; description?: string | null
  organiserName?: string | null; organiserUrl?: string | null; accessibilityInfo?: string | null; ageRestriction?: string | null; transportInfo?: string | null; capacity?: number | null; organiserEditedAt?: string | null; source?: string | null; status?: string | null; hidden?: boolean
  referrals?: { source: string; count: number }[]
}
type Pass = { id: string; status: string; amountCents: number; paymentMode: string; endsAt?: string | null; createdAt: string }
type AdSpend = { id: string; status: string; amountCents: number; paymentMode: string; endsAt?: string | null; createdAt: string; businessName: string; event?: { title: string } | null }
type ClaimRow = { id: string; status: string; createdAt: string; reviewNote?: string | null; event: { id: string; title: string; date: string; city: string; venueName: string } }
type Account = { pro: boolean; proUntil: string | null; displayName: string; homeCity?: string; weeklyReport?: boolean; lastReportAt?: string | null }
type Tab = 'overview' | 'insights' | 'intel' | 'promote' | 'boosts' | 'events' | 'local' | 'billing'

const card = 'rounded-xl bg-card border border-border p-5 shadow-sm'
const field = 'h-control w-full rounded-control border border-border bg-background px-3 text-base'
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' }) : '')
const isLive = (p: Promo) => p.status === 'ACTIVE' && !!p.endsAt && new Date(p.endsAt) > new Date()

const TABS: { key: Tab; label: string; Icon: typeof Rocket }[] = [
  { key: 'overview', label: 'Overview', Icon: BarChart3 },
  { key: 'insights', label: 'Results', Icon: LineChart },
  { key: 'intel', label: 'Intelligence', Icon: Brain },
  { key: 'promote', label: 'Promote an event', Icon: Rocket },
  { key: 'boosts', label: 'Short boosts', Icon: Megaphone },
  { key: 'events', label: 'My events', Icon: CalendarPlus },
  { key: 'local', label: 'Local business ads', Icon: Store },
  { key: 'billing', label: 'Pro & billing', Icon: Receipt },
]

export function PromoterClient({ stripeEnabled }: { stripeEnabled: boolean }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [events, setEvents] = useState<MyEvent[]>([])
  const [account, setAccount] = useState<Account>({ pro: false, proUntil: null, displayName: '' })
  const [passes, setPasses] = useState<Pass[]>([])
  const [ads, setAds] = useState<AdSpend[]>([])
  const [claims, setClaims] = useState<ClaimRow[]>([])
  const [loading, setLoading] = useState(true)
  const [promoteId, setPromoteId] = useState('')
  const [promoteTier, setPromoteTier] = useState('')
  const [promoteDays, setPromoteDays] = useState<Duration | null>(null)
  const [proBusy, setProBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await fetch('/api/promoter/events').then((r) => r.json())
      setEvents(d?.events ?? []); setPasses(d?.passes ?? []); setAds(d?.ads ?? []); setClaims(d?.claims ?? [])
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
    const packageTier = { boost: 'SILVER', spotlight: 'BRONZE', headliner: 'GOLD' }[p.get('package') ?? '']
    const tier = packageTier || p.get('tier')
    if (tier === 'SILVER' || tier === 'BRONZE' || tier === 'GOLD') { setPromoteTier(tier); if (!t && !ev) setTab('promote') }
    const days = Number(p.get('duration') || p.get('days'))
    if (isDuration(days)) setPromoteDays(days)
  }, [load])
  useEffect(() => {
    const label = TABS.find((item) => item.key === tab)?.label ?? 'Dashboard'
    document.title = `${label} · VibePeep`
  }, [tab])
  useEffect(() => {
    const sync = () => {
      const p = new URLSearchParams(window.location.search)
      const t = p.get('tab') as Tab | null
      const ev = p.get('event')
      if (ev) setPromoteId(ev)
      if (t && TABS.some((x) => x.key === t)) setTab(t)
      else if (ev) setTab('promote')
      else setTab('overview')
    }
    window.addEventListener('popstate', sync)
    window.addEventListener(PROMOTER_NAV_EVENT, sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener(PROMOTER_NAV_EVENT, sync)
    }
  }, [])

  const selectTab = useCallback((next: Tab) => {
    setTab(next)
    const href = promoterTabHref(window.location.search, next)
    if (href !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, '', href)
      window.dispatchEvent(new Event(PROMOTER_NAV_EVENT))
    }
  }, [])

  const stats = useMemo(() => {
    const all = events.flatMap((e) => e.promotions ?? [])
    return {
      live: new Set(all.filter((p) => isLive(p) && TIER_KEYS.includes(p.tier as never)).map((p) => p.id)).size,
      views: events.reduce((s, e) => s + (e.views ?? 0), 0),
      clicks: events.reduce((s, e) => s + (e.ticketClicks ?? 0), 0),
      fans: events.reduce((s, e) => s + (e._count?.savedBy ?? 0) + (e._count?.attendees ?? 0), 0),
      spend: all.filter((p) => p.status === 'ACTIVE' || p.status === 'EXPIRED').reduce((s, p) => s + p.amountCents, 0)
        + passes.filter((p) => p.status === 'ACTIVE' || p.status === 'CANCELLED').reduce((s, p) => s + p.amountCents, 0)
        + ads.filter((a) => a.status === 'ACTIVE' || a.status === 'CANCELLED').reduce((s, a) => s + a.amountCents, 0),
    }
  }, [events, passes, ads])

  const startPromote = (id?: string) => { if (id) setPromoteId(id); selectTab('promote'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const buyPro = async () => {
    const price = formatAud(PRO_PLAN.priceCents)
    const label = stripeEnabled
      ? (account.pro ? `Extend Promoter Pro for ${price}? This is charged now.` : `Go Pro for ${price}? This is charged now.`)
      : `${account.pro ? 'Extend' : 'Activate'} Promoter Pro for ${price}? Test mode: no card is charged. The invoice is marked test.`
    if (!window.confirm(label)) return
    setProBusy(true)
    try {
      const res = await fetch('/api/promotions/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: 'PRO', agreePromoterTerms: true }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Checkout failed')
      if (d.url) { window.location.href = d.url; return }
      toast.success(stripeEnabled ? `${PRO_PLAN.name} is on.` : PAYMENTS_COPY.proActivated); load()
    } catch (err) { console.error('Pro checkout failed:', err); toast.error(err instanceof Error ? err.message : 'Checkout failed') } finally { setProBusy(false) }
  }

  return (
    <main className="vp-wrap vp-page-top px-4 pb-8 sm:px-6">
      <div>
        <p className="text-xs font-semibold text-primary">Promoter dashboard</p>
        <h1 className="font-display text-h1 mt-1">{TABS.find((item) => item.key === tab)?.label ?? 'Dashboard'}</h1>
        {account.displayName ? <p className="mt-1 text-sm text-muted-foreground">{account.displayName}</p> : null}
        {tab === 'overview' ? <p className="mt-1 text-sm text-muted-foreground">Your events, your campaigns, your results.</p> : null}
      </div>
      {!stripeEnabled && <div className="mt-5 rounded-lg border border-primary/60 px-4 py-3 text-sm text-primary">{PAYMENTS_COPY.testBanner}</div>}

      <div className="mt-6">
      <div>
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : (
          <>
            {tab === 'overview' && <Overview stats={stats} account={account} events={events} onPromote={startPromote} onPro={buyPro} proBusy={proBusy} cardsLive={stripeEnabled} goEvents={() => selectTab('events')} goInsights={() => selectTab('insights')} onAccount={(a) => setAccount({ ...account, ...a })} onEnded={load} />}
            {tab === 'insights' && <InsightsPanel />}
            {tab === 'boosts' && (
              <section className={card}>
                <BoostStudio events={events} pro={account.pro} cardsLive={stripeEnabled} />
              </section>
            )}
            {tab === 'promote' && (
              <section className={card}>
                <CampaignBuilder events={events} pro={account.pro} stripeEnabled={stripeEnabled} eventId={promoteId} initialTier={promoteTier} initialDays={promoteDays ?? undefined} onEventChange={setPromoteId} onDone={() => { load(); selectTab('events') }} />
              </section>
            )}
            {tab === 'events' && <EventsTab events={events} claims={claims} pro={account.pro} homeCity={account.homeCity || 'Sydney'} onPromote={startPromote} reload={load} />}
            {tab === 'intel' && <IntelTab events={events} />}
            {tab === 'local' && <LocalAdsTab cardsLive={stripeEnabled} />}
            {tab === 'billing' && <Billing events={events} passes={passes} ads={ads} account={account} onPro={buyPro} proBusy={proBusy} cardsLive={stripeEnabled} onEnded={load} />}
          </>
        )}
      </div>
      </div>
    </main>
  )
}

function Kpi({ Icon, label, value, window, definition }: { Icon: typeof Eye; label: string; value: string; window: string; definition: string }) {
  return (
    <div className={card}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4 text-primary" />{label}</div>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{window}</p>
      <p className="mt-1 text-xs text-muted-foreground">{definition}</p>
    </div>
  )
}

function ProCard({ account, onPro, proBusy, cardsLive, className }: { account: Account; onPro: () => void; proBusy: boolean; cardsLive: boolean; className?: string }) {
  const [terms, setTerms] = useState(false)
  const action = account.pro ? 'Extend 30 days' : cardsLive ? 'Go Pro' : 'Go Pro (test mode, no charge)'
  const why = !terms
    ? `Tick the Promoter Terms to turn on ${action}. Nothing is charged until you do.`
    : cardsLive
      ? 'Ticking the terms turns the button on. The charge happens when you confirm.'
      : 'Test mode is on. Ticking the terms turns the button on. Confirming activates Promoter Pro without charging a card, and the invoice is marked test.'
  return (
    <div className={cn('flex h-full flex-col rounded-xl border border-primary/40 bg-gradient-to-br from-primary/20 via-card to-card p-5 shadow-sm', className)}>
      <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /><p className="font-semibold">{PRO_PLAN.name}</p></div>
      {account.pro ? (
        <p className="mt-2 text-sm">Active until <strong>{fmt(account.proUntil)}</strong>. You&apos;re saving {PRO_PLAN.discountPct}% on every campaign.</p>
      ) : (
        <p className="mt-2 text-2xl font-bold">{formatAud(PRO_PLAN.priceCents)}<span className="text-xs font-normal text-muted-foreground"> / {PRO_PLAN.days} days</span></p>
      )}
      <ul className="mt-3 space-y-1.5">{PRO_PLAN.perks.map((p) => <li key={p} className="flex gap-1.5 text-xs text-muted-foreground"><BadgeCheck className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />{p}</li>)}</ul>
      <div className="mt-auto flex flex-col gap-4 pt-4">
        <PromoterTermsCheck id="pro-promoter-terms" checked={terms} onChange={setTerms} />
        <p id="pro-go-why" className="text-xs text-muted-foreground">{why}</p>
        <button onClick={onPro} disabled={proBusy || !terms} aria-describedby="pro-go-why" className="flex min-h-10 w-full items-center justify-center gap-2 whitespace-normal rounded-md bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100">
          {proBusy && <Loader2 className="h-4 w-4 animate-spin" />}{action}
        </button>
      </div>
    </div>
  )
}

function EndCampaignButton({ eventId, label, test, onEnded }: { eventId: string; label: string; test: boolean; onEnded: () => void }) {
  const [busy, setBusy] = useState(false)
  const end = async () => {
    if (!window.confirm(endCampaignConfirm(label, test))) return
    setBusy(true)
    try {
      const res = await fetch('/api/promoter/promotions/end', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not end that campaign')
      toast.success(typeof data.message === 'string' ? data.message : 'Campaign ended')
      onEnded()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not end that campaign')
    } finally {
      setBusy(false)
    }
  }
  return <button type="button" onClick={end} disabled={busy} className="h-8 shrink-0 rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60">End campaign</button>
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
      <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /><p className="font-semibold text-sm">Email me the numbers</p></div>
      <p className="text-xs text-muted-foreground mt-1">Opens, ticket taps, saves and where people came from, straight to your inbox.</p>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span id="weekly-report-label">Weekly report</span>
        <button type="button" role="switch" aria-labelledby="weekly-report-label" aria-checked={!!account.weeklyReport} onClick={toggle} disabled={saving}
          style={{ minHeight: 24, minWidth: 40, height: 24, width: 40 }}
          className={cn('relative shrink-0 rounded-full transition-colors disabled:opacity-60', account.weeklyReport ? 'bg-primary' : 'bg-foreground/25')}>
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all', account.weeklyReport ? 'left-[18px]' : 'left-0.5')} />
        </button>
      </div>
      <button onClick={sendNow} disabled={sending} className="mt-3 w-full h-9 rounded-md border border-border text-sm font-medium flex items-center justify-center gap-2 hover:bg-muted disabled:opacity-60">
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}Email me a report now
      </button>
      {account.lastReportAt && <p className="text-xs text-muted-foreground mt-2">Last sent {fmt(account.lastReportAt)}</p>}
    </div>
  )
}

function ListingHealth({ events, onPromote, goEvents }: { events: MyEvent[]; onPromote: (id?: string) => void; goEvents: () => void }) {
  const cutoff = Date.now() - 86400000
  const upcoming = events.filter((e) => new Date(e.date).getTime() >= cutoff)
  const past = events.length - upcoming.length
  const byCity = new Map<string, { views: number; clicks: number; n: number }>()
  for (const e of events) {
    const city = e.city || 'Unspecified'
    const row = byCity.get(city) ?? { views: 0, clicks: 0, n: 0 }
    row.views += e.views ?? 0
    row.clicks += e.ticketClicks ?? 0
    row.n += 1
    byCity.set(city, row)
  }
  const cities = [...byCity.entries()].sort((a, b) => b[1].views - a[1].views)
  const actions: { title: string; body: string; cta: string; go: () => void }[] = []
  const unboosted = upcoming.find((e) => !e.promotions?.some((p) => isLive(p)))
  if (unboosted) actions.push({ title: `Boost “${unboosted.title}”`, body: 'This upcoming listing has no live campaign. Views and clicks are counted once people open it.', cta: 'Promote', go: () => onPromote(unboosted.id) })
  const missingOf = (e: MyEvent) => [!e.ticketUrl && 'a ticket link', !e.isFree && !e.price && 'a price', !e.imageUrl && 'an image'].filter(Boolean)
  const incomplete = events.find((e) => promoterCanEditEvent(e.source) && new Date(e.date).getTime() >= cutoff && missingOf(e).length)
  if (incomplete) actions.push({ title: `Finish “${incomplete.title}”`, body: `Still missing ${missingOf(incomplete).join(' and ')}.`, cta: 'Open My events', go: goEvents })
  if (!actions.length) actions.push({ title: 'Nothing waiting', body: 'Upcoming listings are on the board. Promote one if you want it higher up.', cta: 'See my events', go: goEvents })
  return (
    <>
      <div className={`${card} flex h-full flex-col`}>
        <p className="font-semibold text-sm">Listings</p>
        <p className="text-sm mt-2"><b className="tabular-nums">{upcoming.length}</b> upcoming · <b className="tabular-nums">{past}</b> past</p>
        <table className="w-full text-xs mt-3">
          <thead><tr className="text-muted-foreground text-left"><th className="py-1 font-medium">City</th><th className="py-1 font-medium text-right">Listings</th><th className="py-1 font-medium text-right">Views</th><th className="py-1 font-medium text-right">Clicks</th></tr></thead>
          <tbody>
            {cities.map(([city, row]) => (
              <tr key={city} className="border-t border-border"><td className="py-1.5">{city}</td><td className="py-1.5 text-right tabular-nums">{row.n}</td><td className="py-1.5 text-right tabular-nums">{row.views.toLocaleString('en-AU')}</td><td className="py-1.5 text-right tabular-nums">{row.clicks.toLocaleString('en-AU')}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`${card} flex h-full flex-col`}>
        <p className="font-semibold text-sm">Next</p>
        <ul className="mt-2 space-y-3">
          {actions.map((a) => (
            <li key={a.title}>
              <p className="text-sm font-medium">{a.title}</p>
              <p className="text-xs text-muted-foreground">{a.body}</p>
              <button type="button" onClick={a.go} className="mt-1 text-xs font-semibold text-primary hover:underline">{a.cta} →</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function Overview({ stats, account, events, onPromote, onPro, proBusy, cardsLive, goEvents, goInsights, onAccount, onEnded }: {
  stats: { live: number; views: number; clicks: number; fans: number; spend: number }; account: Account; events: MyEvent[]
  onPromote: (id?: string) => void; onPro: () => void; proBusy: boolean; cardsLive: boolean; goEvents: () => void; goInsights: () => void; onAccount: (a: Partial<Account>) => void; onEnded: () => void
}) {
  const referrals = events.filter((e) => unlockedFor(e, account.pro)).flatMap((e) => e.referrals ?? [])
  const anyUnlocked = events.some((e) => unlockedFor(e, account.pro))
  const steps = [
    { Icon: CalendarPlus, title: 'Add your event', body: 'Claim a listing we already have, or create a new one in seconds.', action: goEvents, cta: 'Add an event' },
    { Icon: Megaphone, title: 'Choose a package', body: 'Boost, Spotlight or Headliner for 7, 14 or 30 days, plus optional add-ons.', action: () => onPromote(), cta: 'Build a campaign' },
    { Icon: BarChart3, title: 'Track the results', body: 'Opens, saves, reactions, Spotlight and the drop-off in between.', action: goInsights, cta: 'Open results' },
  ]
  return (
    <div className="vp-stack">
      <div className="vp-card-grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <Kpi Icon={Rocket} label="Live campaigns" value={String(stats.live)} window="Right now" definition="Campaigns still active, whose end time has not passed." />
        <Kpi Icon={Eye} label="Listing views" value={stats.views.toLocaleString('en-AU')} window="All time" definition="Event page visits stored on your events." />
        <Kpi Icon={MousePointerClick} label="Ticket clicks" value={stats.clicks.toLocaleString('en-AU')} window="All time" definition={stats.views ? `Taps on the ticket link. ${((stats.clicks / stats.views) * 100).toFixed(1)}% of listing views.` : 'Taps on the ticket link stored on your events.'} />
        <Kpi Icon={Users} label="Saves and going" value={stats.fans.toLocaleString('en-AU')} window="All time" definition="Saves plus people marked going, from the counts on your events." />
        <Kpi Icon={Wallet} label="Total invested" value={formatAud(stats.spend)} window="All time" definition="Active and expired campaigns, plus active and cancelled passes and local ads. AUD." />
      </div>

      <section className={card}>
        <h2 className="font-semibold mb-4">How it works</h2>
        <ol className="vp-card-grid md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex h-full flex-col rounded-lg border border-border bg-background p-5">
              <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span><s.Icon className="h-4 w-4 text-primary" /></div>
              <p className="mt-3 text-sm font-semibold">{s.title}</p>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{s.body}</p>
              <button onClick={s.action} className="mt-3 whitespace-nowrap text-left text-sm font-semibold text-primary hover:underline">{s.cta} →</button>
            </li>
          ))}
        </ol>
      </section>
      <div className="vp-card-grid items-start lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="vp-stack">
          {!events.length && (
            <section className={card}>
              <p className="font-medium">Nothing on your board yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Create an event you can edit, claim one you organise, or add a local business ad. Views and ticket taps show up here once people open your listings.</p>
            </section>
          )}
          {events.length > 0 && (
            <div className="vp-card-grid items-stretch sm:grid-cols-2">
              <ListingHealth events={events} onPromote={onPromote} goEvents={goEvents} />
            </div>
          )}
          <section className={`${card} flex flex-col gap-4`}>
            {events.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Your next events</h3>
                <div className="divide-y divide-border">
                  {events.filter((e) => new Date(e.date).getTime() >= Date.now() - 86400000).slice(0, 4).map((e) => {
                    const live = e.promotions?.find((p) => isLive(p) && tierDef(p.tier))
                    return (
                      <div key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0 truncate">{e.hidden ? <span className="font-medium">{e.title}</span> : <Link href={`/events/${e.id}`} className="font-medium hover:text-primary">{e.title}</Link>} <span className="text-xs text-muted-foreground">· {fmt(e.date)}{e.hidden ? ' · Draft' : ''}</span></span>
                        {live ? (
                          <span className="flex shrink-0 items-center gap-2">
                            <TierBadge tier={live.tier} />
                            <EndCampaignButton eventId={e.id} label={productName(live.tier)} test={live.paymentMode === 'test'} onEnded={onEnded} />
                          </span>
                        ) : <button onClick={() => onPromote(e.id)} className="shrink-0 text-xs font-semibold text-primary hover:underline">Promote</button>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Share2 className="h-4 w-4 text-primary" />Where your visitors come from</h3>
              {anyUnlocked ? <ReferralBars referrals={referrals} /> : <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" />Traffic sources unlock for promoted events, or for every event with {PRO_PLAN.name}.</p>}
            </div>
          </section>
        </div>
        <div className="flex h-full flex-col gap-[var(--vp-card-gap)]">
          <ProCard account={account} onPro={onPro} proBusy={proBusy} cardsLive={cardsLive} className="min-h-0 flex-1" />
          <ReportsCard account={account} onAccount={onAccount} />
        </div>
      </div>

      <AudienceCard />
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const t = tierDef(tier)
  return <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-bold text-black" style={{ backgroundColor: t?.color ?? BRAND_ORANGE }}>{(t?.name ?? productName(tier)).toUpperCase()}</span>
}

const blankListing = (city: string) => ({
  title: '', date: '', endDate: '', time: '', endTime: '', venueName: '', venueAddress: '', city, category: 'Community', subTag: '',
  price: '', isFree: false, isLGBTI: false, ticketUrl: '', imageUrl: '', description: '', galleryUrls: '', organiserName: '', organiserUrl: '',
  accessibilityInfo: '', ageRestriction: '', transportInfo: '', capacity: '',
})

function EventsTab({ events, claims, pro, homeCity, onPromote, reload }: { events: MyEvent[]; claims: ClaimRow[]; pro: boolean; homeCity: string; onPromote: (id: string) => void; reload: () => void }) {
  const [q, setQ] = useState('')
  const [claimCity, setClaimCity] = useState(homeCity || 'Sydney')
  const [results, setResults] = useState<MyEvent[]>([])
  const [searching, setSearching] = useState(false)
  const [claimNote, setClaimNote] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showAllClaims, setShowAllClaims] = useState(false)
  const [form, setForm] = useState(() => blankListing(homeCity || 'Sydney'))
  const cityTouched = useRef(false)
  useEffect(() => { if (!cityTouched.current && homeCity) setForm((f) => ({ ...f, city: homeCity })); setClaimCity((c) => cityTouched.current ? c : homeCity || c) }, [homeCity])
  const searchSeq = useRef(0)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (k === 'city') cityTouched.current = true
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
    setForm((f) => applyListingField(f, k, value))
  }

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    const seq = ++searchSeq.current
    setSearching(true); setClaimNote('')
    const params = new URLSearchParams({ search: q, limit: '20', sortBy: 'date' })
    if (claimCity) params.set('city', claimCity)
    const d = await fetch(`/api/events?${params}`).then((r) => r.json()).catch((err) => { console.error('Search failed:', err); return {} })
    if (seq !== searchSeq.current) return
    setResults(d?.events ?? []); setSearching(false)
  }
  const claim = async (eventId: string) => {
    setClaimNote('')
    const res = await fetch('/api/promoter/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId }) })
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      toast.success(d?.status === 'APPROVED' ? 'Event added to your dashboard' : 'Claim sent. It stays under Pending claims until we review it.')
      setResults((r) => r.filter((x) => x.id !== eventId)); reload()
    } else {
      const message = d?.error ?? 'Could not claim event'
      setClaimNote(message)
      toast.error(message)
    }
  }
  const publishListing = async (eventId: string) => {
    const res = await fetch(`/api/promoter/events/${eventId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publish: true }) })
    const d = await res.json().catch(() => ({}))
    if (res.ok) { toast.success('Published. It’s on the public board.'); reload() }
    else toast.error(d?.error ?? 'Could not publish')
  }
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter
    const publish = submitter instanceof HTMLButtonElement && submitter.value === 'publish'
    const date = auToIso(form.date)
    const endDate = form.endDate.trim() ? auToIso(form.endDate) : ''
    if (!date) { toast.error('Enter the start date as dd/mm/yyyy'); return }
    if (form.endDate.trim() && !endDate) { toast.error('Enter the end date as dd/mm/yyyy'); return }
    const timeError = finishTimeError({ startDate: form.date, endDate: form.endDate, time: form.time, endTime: form.endTime })
    if (timeError) { toast.error(timeError); return }
    setCreating(true)
    try {
      const res = await fetch('/api/promoter/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, date, endDate: endDate || '', price: listingPayloadPrice(form.isFree, form.price), subTags: form.subTag ? [form.subTag] : [], publish }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(publish ? 'Published. It’s on the public board.' : 'Draft saved. It stays off the public board until you publish it.')
        setForm(blankListing(form.city))
        reload()
      } else toast.error(d?.error ?? 'Could not create event')
    } finally { setCreating(false) }
  }
  const subTags = CATEGORIES.find((c) => c.name === form.category)?.subTags ?? []
  const pendingClaims = claims.filter((c) => c.status === 'PENDING')
  const owned = new Set(events.map((e) => e.id))

  return (
    <div className="vp-stack">
      <section className={card}>
        <h2 className="font-semibold mb-1">My events</h2>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="text-xs text-muted-foreground">{pro ? 'Pro analytics are on for all your events.' : 'Views, saves and ticket clicks are on every listing. The deeper reads open with a promotion or Promoter Pro.'}</p>
          <a href="/api/promoter/events/export" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Download className="w-3.5 h-3.5" />Download CSV</a>
        </div>
        {!!pendingClaims.length && (
          <div className="mb-4 rounded-lg border border-border bg-background p-3">
            <p className="text-sm font-medium">Pending claims</p>
            <ul className="mt-2 space-y-1.5">
              {pendingClaims.map((c) => (
                <li key={c.id} className="text-sm text-muted-foreground">{c.event.title} · {fmt(c.event.date)} · {c.event.city} · <span className="text-foreground">Waiting for review</span></li>
              ))}
            </ul>
          </div>
        )}
        {!events.length ? <p className="text-sm text-muted-foreground">Empty stage. Claim a listing or create an event to get going.</p> : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm min-w-[720px]">
              <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="font-medium px-5 py-2">Event</th><th className="font-medium px-3">Status</th><th className="font-medium px-3 text-right">Views</th><th className="font-medium px-3 text-right">Ticket clicks</th><th className="font-medium px-3 text-right">Saves / going</th><th className="font-medium px-3 text-right">Reactions</th><th className="px-5" />
              </tr></thead>
              <tbody className="divide-y divide-border">
                {events.map((ev) => {
                  const liveTier = ev.promotions?.filter((p) => isLive(p) && tierDef(p.tier)).sort((a, b) => (tierDef(b.tier)!.priceCents - tierDef(a.tier)!.priceCents))[0]
                  const liveAddons = ev.promotions?.filter((p) => isLive(p) && !tierDef(p.tier)) ?? []
                  const past = new Date(ev.date).getTime() < Date.now() - 86400000
                  return (
                    <Fragment key={ev.id}>
                    <tr className="align-top">
                      <td className="px-5 py-3 min-w-0">
                        {ev.hidden ? <span className="font-medium">{ev.title}</span> : <Link href={`/events/${ev.id}`} className="font-medium hover:text-primary">{ev.title}</Link>}
                        <p className="text-xs text-muted-foreground">{fmt(ev.date)} · {ev.venueName}{ev.city ? ` · ${ev.city}` : ''}</p>
                        {promoterCanEditEvent(ev.source) && ev.organiserEditedAt && <p className="text-xs text-muted-foreground mt-0.5">Edited by you {fmt(ev.organiserEditedAt)}</p>}
                        {!promoterCanEditEvent(ev.source) && <p className="text-xs text-muted-foreground mt-0.5">Details stay as published until you add an organiser update</p>}
                      </td>
                      <td className="px-3 py-3">
                        {ev.status === 'CANCELLED' ? <span className="text-xs text-muted-foreground">Unpublished</span> : ev.hidden ? <span className="text-xs font-semibold">Draft</span> : past ? <span className="text-xs text-muted-foreground">Finished</span> : liveTier ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1"><TierBadge tier={liveTier.tier} />{liveAddons.map((a) => <span key={a.id} className="rounded px-1.5 py-0.5 text-xs font-bold bg-primary/15 text-primary">{productName(a.tier).toUpperCase()}</span>)}</div>
                            <p className="text-xs text-muted-foreground">until {fmt(liveTier.endsAt)}</p>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">Not promoted</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {(ev.views ?? 0).toLocaleString('en-AU')}
                        {(ev.views ?? 0) > 0 && <span className="block text-xs text-muted-foreground">{((((ev._count?.savedBy ?? 0) + (ev._count?.attendees ?? 0) + (ev.reactionCount ?? 0) + (ev.ticketClicks ?? 0)) / (ev.views || 1)) * 100).toFixed(1)}% engagement</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{(ev.ticketClicks ?? 0).toLocaleString('en-AU')}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{ev._count?.savedBy ?? 0} / {ev._count?.attendees ?? 0}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{ev.reactionCount ?? 0}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          {ev.hidden && ev.status !== 'CANCELLED' && promoterCanEditEvent(ev.source) && <button type="button" onClick={() => publishListing(ev.id)} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold">Publish</button>}
                          {promoterCanEditEvent(ev.source) ? <button onClick={() => setEditing(editing === ev.id ? null : ev.id)} className="h-8 px-3 rounded-md border border-border text-xs font-medium flex items-center gap-1 hover:bg-muted"><Pencil className="w-3.5 h-3.5" />Edit</button> : <Link href={`/events/${ev.id}/manage`} className="h-8 px-3 rounded-md border border-border text-xs font-medium inline-flex items-center gap-1 hover:bg-muted"><Pencil className="w-3.5 h-3.5" />Edit</Link>}
                          {promoterCanEditEvent(ev.source) && ev.status !== 'CANCELLED' && <button onClick={async () => { if (!window.confirm(`Unpublish “${ev.title}”? It leaves the public board. Purchases stay in billing.`)) return; const res = await fetch(`/api/promoter/events/${ev.id}`, { method: 'DELETE' }); if (res.ok) { toast.success('Listing unpublished'); reload() } else toast.error('Could not unpublish') }} className="h-8 px-2 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted" aria-label={`Unpublish ${ev.title}`}><Trash2 className="w-3.5 h-3.5" /></button>}
                          {!past && ev.status !== 'CANCELLED' && <button onClick={() => onPromote(ev.id)} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold">{liveTier ? productName(liveTier.tier) : 'Promote'}</button>}
                          {liveTier && <EndCampaignButton eventId={ev.id} label={productName(liveTier.tier)} test={liveTier.paymentMode === 'test'} onEnded={reload} />}
                        </div>
                      </td>
                    </tr>
                    {editing === ev.id && promoterCanEditEvent(ev.source) && <tr><td colSpan={7} className="px-5 pb-4"><EditEventPanel event={ev} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} /></td></tr>}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="vp-card-grid items-start lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold mb-1">Already listed? Claim it</h2>
          <p className="text-xs text-muted-foreground mb-3">We list thousands of events automatically. Find yours and add it to your dashboard.</p>
          <form onSubmit={search} className="grid gap-2">
            <select value={claimCity} onChange={(e) => setClaimCity(e.target.value)} className={field} aria-label="City to search">{CITIES.map((c) => <option key={c.name} value={c.name}>{boardDisplayName(c.name)}</option>)}</select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Event name or venue" className={field} aria-label="Search listings" />
            <button className="flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search</button>
          </form>
          {claimNote && <p className="mt-2 text-sm text-destructive" role="alert">{claimNote}</p>}
          {!!results.length && <p className="mt-3 text-xs text-muted-foreground">{results.length} {results.length === 1 ? 'match' : 'matches'}</p>}
          <div className="mt-2">
            {(showAllClaims ? results : results.slice(0, 10)).map((r) => {
              const pending = claims.some((c) => c.event.id === r.id && c.status === 'PENDING')
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{fmt(r.date)}{r.time ? ` · ${r.time}` : ''} · {r.venueName}{r.city ? `, ${r.city}` : ''}</span>
                  </span>
                  {owned.has(r.id) ? <span className="text-xs text-muted-foreground">Yours</span> : pending ? <span className="text-xs font-medium">Pending</span> : <button onClick={() => claim(r.id)} className="h-8 shrink-0 rounded-md border border-border px-3 text-xs hover:bg-muted">Claim</button>}
                </div>
              )
            })}
          </div>
          {results.length > 10 && <button type="button" onClick={() => setShowAllClaims((on) => !on)} className="mt-2 text-sm font-semibold text-primary">{showAllClaims ? 'Show fewer' : `Show all ${results.length}`}</button>}
        </section>

        <section id="create" className={`${card} scroll-mt-24`}>
          <h2 className="font-semibold mb-1">Create a new event</h2>
          <p className="text-xs text-muted-foreground mb-3">This saves a draft. It stays off the public board until you press Publish.</p>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium sm:col-span-2">Title<input required value={form.title} onChange={set('title')} placeholder="Harbour nights" className={`${field} mt-1 font-normal`} /></label>
            <label className="block text-sm font-medium">Start date<input required inputMode="numeric" placeholder="dd/mm/yyyy" autoComplete="off" value={form.date} onChange={set('date')} className={`${field} mt-1 font-normal`} /></label>
            <label className="block text-sm font-medium">Start time<input type="time" value={form.time} onChange={set('time')} className={`${field} mt-1 min-w-[9rem] font-normal`} /></label>
            <label className="block text-sm font-medium">End date<input inputMode="numeric" placeholder="dd/mm/yyyy" autoComplete="off" value={form.endDate} onChange={set('endDate')} className={`${field} mt-1 font-normal`} /></label>
            <label className="block text-sm font-medium">Finish time<input type="time" value={form.endTime} onChange={set('endTime')} className={`${field} mt-1 min-w-[9rem] font-normal`} /></label>
            <label className="block text-sm font-medium">Venue<input required value={form.venueName} onChange={set('venueName')} placeholder="Venue name" className={`${field} mt-1 font-normal`} /></label>
            <label className="block text-sm font-medium">City<select value={form.city} onChange={set('city')} className={`${field} mt-1 font-normal`}>{CITIES.map((c) => <option key={c.name} value={c.name}>{boardDisplayName(c.name)}</option>)}</select></label>
            <label className="block text-sm font-medium sm:col-span-2">Address<input value={form.venueAddress} onChange={set('venueAddress')} placeholder="Street, suburb, postcode" className={`${field} mt-1 font-normal`} /></label>
            <label className="block text-sm font-medium">Category<select value={form.category} onChange={set('category')} className={`${field} mt-1 font-normal`}>{CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}</select></label>
            <label className="block text-sm font-medium">Subtag<select value={form.subTag} onChange={set('subTag')} className={`${field} mt-1 font-normal`}><option value="">Optional</option>{subTags.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="block text-sm font-medium sm:col-span-2">Price<input value={form.price} onChange={set('price')} placeholder="$25 or Free" disabled={form.isFree} className={`${field} mt-1 font-normal`} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isFree} onChange={set('isFree')} /> Free event</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isLGBTI} onChange={set('isLGBTI')} /> LGBTIQ+ event</label>
            <label className="block text-sm font-medium">Capacity<input value={form.capacity} onChange={set('capacity')} inputMode="numeric" placeholder="Optional" className={`${field} mt-1 font-normal`} /></label>
            <label className="block text-sm font-medium sm:col-span-2">Ticket link<input value={form.ticketUrl} onChange={set('ticketUrl')} placeholder="https://" className={`${field} mt-1 font-normal`} /></label>
            <label className="block text-sm font-medium sm:col-span-2">Image link<input value={form.imageUrl} onChange={set('imageUrl')} placeholder="https:// — optional" className={`${field} mt-1 font-normal`} /></label>
            <label className="block text-sm font-medium sm:col-span-2">Description<textarea value={form.description} onChange={set('description')} placeholder="What happens, in your own words" rows={3} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-normal" /></label>
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
            <p className="sm:col-span-2 text-xs text-muted-foreground">Include the suburb and postcode in the address so the map pin and Intelligence use that suburb, not the city centre. On the same day, the finish time has to be later than the start.</p>
            {finishTimeError({ startDate: form.date, endDate: form.endDate, time: form.time, endTime: form.endTime }) && <p className="sm:col-span-2 text-sm text-destructive" role="alert">{finishTimeError({ startDate: form.date, endDate: form.endDate, time: form.time, endTime: form.endTime })}</p>}
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <button type="submit" value="draft" disabled={creating} className="h-10 rounded-md border border-border px-4 text-sm font-semibold disabled:opacity-60">{creating ? 'Saving…' : 'Save draft'}</button>
              <button type="submit" value="publish" disabled={creating} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{creating ? 'Saving…' : 'Publish'}</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}

function Billing({ events, passes, ads, account, onPro, proBusy, cardsLive, onEnded }: { events: MyEvent[]; passes: Pass[]; ads: AdSpend[]; account: Account; onPro: () => void; proBusy: boolean; cardsLive: boolean; onEnded: () => void }) {
  const rows = useMemo(() => {
    const orders = new Map<string, { id: string; eventId: string | null; date: string; title: string; items: string[]; cents: number; status: string; test: boolean; endsAt?: string | null; kind: 'campaign' | 'pass' | 'ad' }>()
    for (const e of events) for (const p of e.promotions ?? []) {
      if (p.status === 'PENDING') continue
      const key = p.orderId ?? p.id
      const o = orders.get(key) ?? { id: key, eventId: e.id, date: p.createdAt, title: e.title, items: [], cents: 0, status: p.status, test: p.paymentMode === 'test', endsAt: p.endsAt, kind: 'campaign' as const }
      o.items.push(`${productName(p.tier)}${p.days ? ` · ${p.days}d` : ''}`); o.cents += p.amountCents
      if (tierDef(p.tier)) { o.status = p.status; o.endsAt = p.endsAt }
      orders.set(key, o)
    }
    for (const p of passes) orders.set(p.id, { id: p.id, eventId: null, date: p.createdAt, title: PRO_PLAN.name, items: ['30-day membership'], cents: p.amountCents, status: p.status, test: p.paymentMode === 'test', endsAt: p.endsAt, kind: 'pass' })
    for (const a of ads) orders.set(a.id, { id: a.id, eventId: null, date: a.createdAt, title: a.businessName, items: [`Local recommendation${a.event?.title ? ` · ${a.event.title}` : ''}`], cents: a.amountCents, status: a.status, test: a.paymentMode === 'test', endsAt: a.endsAt, kind: 'ad' })
    return [...orders.values()].sort((a, b) => +new Date(b.date) - +new Date(a.date))
  }, [events, passes, ads])
  const statusLabel = (r: (typeof rows)[number]) => (r.status === 'CANCELLED' ? 'Cancelled' : r.endsAt && new Date(r.endsAt) > new Date() ? 'Active' : 'Completed')

  return (
    <div className="vp-stack">
      <OrganiserPlans cardsLive={cardsLive} />
      <div className="vp-card-grid items-start lg:grid-cols-[minmax(0,1fr)_20rem]">
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
                    <td className="px-3 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', statusLabel(r) === 'Active' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>{statusLabel(r)}</span>{r.test && <span className="ml-1.5 text-xs text-muted-foreground">test</span>}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium">{formatAud(r.cents)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex flex-wrap items-center justify-end gap-2">
                        {r.kind === 'campaign' && r.eventId && statusLabel(r) === 'Active' && <EndCampaignButton eventId={r.eventId} label={r.items[0] || 'this campaign'} test={r.test} onEnded={onEnded} />}
                        <Link href={`/promoter/invoice/${encodeURIComponent(r.id)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><FileText className="w-3.5 h-3.5" />View</Link>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-4">Prices in AUD, GST inclusive. Open any invoice to print it or save it as a PDF. A purchase is not refunded automatically just because a campaign ends. See the <Link href="/refunds" className="underline">refund policy</Link>, including your rights under the Australian Consumer Law.</p>
        {account.pro && <button type="button" onClick={async () => { if (!window.confirm('End Promoter Pro now? Days already used are not automatically refunded. The refunds page still applies.')) return; const res = await fetch('/api/promoter/pro/cancel', { method: 'POST' }); if (res.ok) { toast.success('Pro ended'); onEnded() } else toast.error('Could not end Pro') }} className="mt-3 text-xs text-muted-foreground underline">End Pro</button>}
      </section>
      <ProCard account={account} onPro={onPro} proBusy={proBusy} cardsLive={cardsLive} />
      </div>
    </div>
  )
}
