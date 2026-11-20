'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, Loader2, Lock, Sparkles } from 'lucide-react'
import { campaignScheduleNote } from '@/lib/promoter-listing'
import { ADDONS, DURATIONS, PRO_PLAN, TIERS, formatAud, quote, tierDef, type Addon, type Duration, type Tier } from '@/lib/tiers'
import { cn } from '@/lib/utils'
import { PlacementPreview } from './placement-preview'
import { PromoterTermsCheck } from '@/components/promoter-terms-check'

type Ev = { id: string; title: string; date: string; city?: string; venueName: string; imageUrl?: string | null }

const fmt = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-[#1a1408]">{n}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  )
}

export function CampaignBuilder({ events, pro, stripeEnabled, eventId, initialTier, initialDays, onEventChange, onDone }: {
  events: Ev[]; pro: boolean; stripeEnabled: boolean; eventId: string; initialTier?: string; initialDays?: Duration; onEventChange: (id: string) => void; onDone: () => void
}) {
  const startTier: Tier = initialTier === 'SILVER' || initialTier === 'GOLD' || initialTier === 'BRONZE' ? initialTier : 'BRONZE'
  const [tier, setTier] = useState<Tier>(startTier)
  const [days, setDays] = useState<Duration>(initialDays ?? tierDef(startTier)?.headlineDays ?? 14)
  const [addons, setAddons] = useState<Addon[]>([])
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState(false)
  const [agreePromoterTerms, setAgreePromoterTerms] = useState(false)
  const [placed, setPlaced] = useState(false)
  const [now, setNow] = useState(0)
  useEffect(() => { setNow(Date.now()) }, [])
  const upcoming = useMemo(() => (now ? events.filter((e) => new Date(e.date).getTime() >= now - 86400000) : events), [events, now])

  const q = quote(tier, days, addons, pro)
  const selected = upcoming.find((e) => e.id === eventId) ?? upcoming[0]
  useEffect(() => {
    if (selected && selected.id !== eventId) onEventChange(selected.id)
  }, [selected, eventId, onEventChange])
  const toggleAddon = (a: Addon) => setAddons((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]))

  const scheduleNote = selected && now ? campaignScheduleNote(selected.date, days, now) : null
  const checkout = async () => {
    if (!selected) { toast.error('Choose an event to promote'); return }
    if (!review) { setReview(true); return }
    if (!agreePromoterTerms) { toast.error('Tick that you agree to the Promoter Terms.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/promotions/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId: selected.id, tier, days, addons, agreePromoterTerms: true }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Checkout failed')
      if (d.url) { window.location.href = d.url; return }
      toast.success('Campaign is live (test mode — no card charged)')
      setAddons([])
      setReview(false)
      setPlaced(true)
      onDone()
    } catch (err) {
      console.error('Checkout failed:', err)
      toast.error(err instanceof Error ? err.message : 'Checkout failed')
    } finally { setBusy(false) }
  }

  if (!upcoming.length) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have any upcoming events yet. Claim an existing listing or create a new event in the <strong>My events</strong> tab, then come back here to promote it.</p>
  }

  const blocked = !selected ? 'Choose an event before you review the campaign.' : null

  return (
    <div className="vp-card-grid items-start lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="vp-stack min-w-0">
        <div>
          <h2 className="font-display text-xl font-bold">Build a campaign</h2>
          <p className="mt-1 text-sm text-muted-foreground">Four steps. Live as soon as payment lands.</p>
        </div>
        <Step n={1} title="Choose the event">
          <select value={selected?.id ?? ''} onChange={(e) => onEventChange(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" aria-label="Event to promote">
            {upcoming.map((e) => <option key={e.id} value={e.id}>{e.title} — {fmt(e.date)}{e.city ? ` · ${e.city}` : ''}</option>)}
          </select>
        </Step>

        <Step n={2} title="Pick a package">
          <div className="grid w-full items-stretch gap-[var(--vp-card-gap)] pt-3 sm:grid-cols-3">
            {TIERS.map((t) => {
              const on = tier === t.key
              return (
                <button key={t.key} type="button" onClick={() => { setTier(t.key); setReview(false) }} aria-pressed={on}
                  className={cn('relative flex h-full flex-col rounded-xl border bg-background p-4 text-left', on ? 'border-primary shadow-md ring-2 ring-primary/40' : 'border-border hover:border-muted-foreground/40')}>
                  {t.key === 'BRONZE' && <span className="absolute left-4 top-0 z-10 -translate-y-1/2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-[#1a1408]">POPULAR</span>}
                  <span className="block h-1.5 w-10 rounded-full" style={{ backgroundColor: t.color }} />
                  <p className="mt-3 font-semibold">{t.name}</p>
                  <p className="mt-1 min-h-10 text-xs text-muted-foreground">{t.tagline}</p>
                  <p className="mt-3 text-xl font-bold tabular-nums">{formatAud(t.prices[days])}</p>
                  <p className="text-xs text-muted-foreground">{days} days</p>
                  <ul className="mt-3 flex-1 space-y-1">{t.perks.map((p) => <li key={p} className="flex gap-1.5 text-xs text-muted-foreground"><Check className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />{p}</li>)}</ul>
                </button>
              )
            })}
          </div>
        </Step>

        <Step n={3} title="How long should it run?">
          <div className="grid w-full grid-cols-3 gap-2" role="radiogroup" aria-label="Campaign length">
            {DURATIONS.map((d) => (
              <button key={d.days} type="button" role="radio" aria-checked={days === d.days} onClick={() => setDays(d.days)}
                className={cn('flex min-h-14 w-full flex-col items-center justify-center rounded-xl border px-2 py-2 text-center', days === d.days ? 'border-primary bg-primary text-[#1a1408]' : 'border-border bg-background text-foreground')}>
                <span className="text-sm font-semibold">{d.label}</span>
                <span className={cn('mt-0.5 min-h-4 text-[11px] leading-tight', days === d.days ? 'text-[#1a1408]/80' : 'text-muted-foreground')}>{d.note ?? ' '}</span>
              </button>
            ))}
          </div>
        </Step>

        <Step n={4} title="Boost it further (optional)">
          <div className="grid w-full items-stretch gap-[var(--vp-card-gap)] sm:grid-cols-2">
            {ADDONS.map((a) => {
              const on = addons.includes(a.key)
              return (
                <button key={a.key} type="button" onClick={() => toggleAddon(a.key)} aria-pressed={on}
                  className={cn('flex h-full gap-3 rounded-xl border bg-background p-4 text-left', on ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-muted-foreground/40')}>
                  <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border', on ? 'border-primary bg-primary text-[#1a1408]' : 'border-border bg-background')}>{on && <Check className="h-3.5 w-3.5" />}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{a.name} <span className="text-primary">+{formatAud(a.prices[days])}</span></span>
                    <span className="mt-1 block text-xs text-muted-foreground">{a.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </Step>

        <PlacementPreview key={selected?.id} event={selected} tier={tier} addons={addons} />
      </div>

      <aside className="h-fit rounded-xl border border-border bg-background p-5 shadow-sm lg:sticky lg:top-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Order summary</p>
        <p className="mt-2 truncate font-semibold" title={selected?.title}>{selected?.title ?? 'No event selected'}</p>
        <p className="text-xs text-muted-foreground">{days}-day campaign · starts immediately</p>
        <div className="my-4 space-y-2 text-sm">
          {q.lines.map((l) => (
            <div key={l.key} className="flex justify-between gap-2">
              <span>{l.name}</span>
              <span className="inline-flex items-baseline gap-2 tabular-nums">{pro && l.cents !== l.listCents && <s className="text-muted-foreground">{formatAud(l.listCents)}</s>}<span>{formatAud(l.cents)}</span></span>
            </div>
          ))}
          {pro && q.saving > 0 && <div className="flex justify-between text-xs text-free"><span>Pro saving ({PRO_PLAN.discountPct}%)</span><span>−{formatAud(q.saving)}</span></div>}
        </div>
        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="font-semibold">Total</span>
          <span className="text-2xl font-bold tabular-nums">{formatAud(q.total)}</span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">AUD, GST inclusive. One-off payment. Placements are labelled Sponsored. <Link href="/refunds" className="underline">Refunds</Link>, including under the Australian Consumer Law, are on the refunds page.</p>
        {scheduleNote && <p className="mt-3 text-xs text-muted-foreground" role="status">{scheduleNote}</p>}
        <div className="mt-4"><PromoterTermsCheck id="campaign-promoter-terms" checked={agreePromoterTerms} onChange={setAgreePromoterTerms} /></div>
        {placed && <p className="mt-3 text-sm" role="status">That campaign is live. Choose another package only if you mean to buy a second one.</p>}
        <button onClick={checkout} disabled={busy || !selected} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-[#1a1408] disabled:bg-muted disabled:text-muted-foreground">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          {review ? (stripeEnabled ? `Confirm ${formatAud(q.total)} and pay` : `Confirm and activate ${formatAud(q.total)}`) : 'Review campaign'}
        </button>
        {blocked && <p className="mt-2 text-xs text-muted-foreground">{blocked}</p>}
        {review && <button type="button" onClick={() => setReview(false)} className="mt-2 w-full text-xs text-muted-foreground underline">Back to the package</button>}
        {!pro && (
          <p className="mt-4 flex gap-1.5 text-xs text-muted-foreground"><Sparkles className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />With {PRO_PLAN.name} you&apos;d pay {formatAud(quote(tier, days, addons, true).total)} for this campaign.</p>
        )}
      </aside>
    </div>
  )
}
