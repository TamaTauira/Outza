'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Lock, Sparkles } from 'lucide-react'
import { ADDONS, DURATIONS, PRO_PLAN, TIERS, formatAud, quote, type Addon, type Duration, type Tier } from '@/lib/tiers'
import { cn } from '@/lib/utils'
import { PlacementPreview } from './placement-preview'

type Ev = { id: string; title: string; date: string; city?: string; venueName: string; imageUrl?: string | null }

const fmt = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{n}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  )
}

export function CampaignBuilder({ events, pro, stripeEnabled, eventId, onEventChange, onDone }: {
  events: Ev[]; pro: boolean; stripeEnabled: boolean; eventId: string; onEventChange: (id: string) => void; onDone: () => void
}) {
  const [tier, setTier] = useState<Tier>('BRONZE')
  const [days, setDays] = useState<Duration>(30)
  const [addons, setAddons] = useState<Addon[]>([])
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(0)
  useEffect(() => { setNow(Date.now()) }, [])
  const upcoming = useMemo(() => (now ? events.filter((e) => new Date(e.date).getTime() >= now - 86400000) : events), [events, now])
  useEffect(() => { if (!eventId && upcoming[0]) onEventChange(upcoming[0].id) }, [eventId, upcoming, onEventChange])

  const q = quote(tier, days, addons, pro)
  const selected = upcoming.find((e) => e.id === eventId)
  const toggleAddon = (a: Addon) => setAddons((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]))

  const checkout = async () => {
    if (!selected) { toast.error('Choose an event to promote'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/promotions/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId: selected.id, tier, days, addons }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Checkout failed')
      if (d.url) { window.location.href = d.url; return }
      toast.success('Campaign is live (test mode — no card charged)')
      setAddons([])
      onDone()
    } catch (err) {
      console.error('Checkout failed:', err)
      toast.error(err instanceof Error ? err.message : 'Checkout failed')
    } finally { setBusy(false) }
  }

  if (!upcoming.length) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have any upcoming events yet. Claim an existing listing or create a new event in the <strong>My events</strong> tab, then come back here to promote it.</p>
  }

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-8">
      <div className="space-y-8">
        <Step n={1} title="Choose the event">
          <select value={eventId} onChange={(e) => onEventChange(e.target.value)} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm" aria-label="Event to promote">
            {upcoming.map((e) => <option key={e.id} value={e.id}>{e.title} — {fmt(e.date)}{e.city ? ` · ${e.city}` : ''}</option>)}
          </select>
        </Step>

        <Step n={2} title="Pick a package">
          <div className="grid sm:grid-cols-3 gap-3">
            {TIERS.map((t) => {
              const on = tier === t.key
              return (
                <button key={t.key} type="button" onClick={() => setTier(t.key)} aria-pressed={on}
                  className={cn('relative text-left rounded-xl border p-4 transition-all bg-background', on ? 'border-primary ring-2 ring-primary/40 shadow-md' : 'border-border hover:border-muted-foreground/40')}>
                  {t.key === 'BRONZE' && <span className="absolute -top-2 right-3 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5">POPULAR</span>}
                  <span className="block h-1.5 w-10 rounded-full mb-3" style={{ backgroundColor: t.color }} />
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.tagline}</p>
                  <p className="mt-2 text-xl font-bold">{formatAud(t.prices[days])}<span className="text-xs font-normal text-muted-foreground"> / {days} days</span></p>
                  <ul className="mt-2 space-y-1">{t.perks.map((p) => <li key={p} className="flex gap-1.5 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5 shrink-0 text-primary mt-px" />{p}</li>)}</ul>
                </button>
              )
            })}
          </div>
        </Step>

        <Step n={3} title="How long should it run?">
          <div className="inline-flex rounded-lg border border-border p-1 bg-background" role="radiogroup" aria-label="Campaign length">
            {DURATIONS.map((d) => (
              <button key={d.days} type="button" role="radio" aria-checked={days === d.days} onClick={() => setDays(d.days)}
                className={cn('px-4 h-9 rounded-md text-sm font-medium transition-colors', days === d.days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {d.label}{d.note && <span className="hidden sm:inline text-[10px] opacity-80"> · {d.note}</span>}
              </button>
            ))}
          </div>
        </Step>

        <Step n={4} title="Boost it further (optional)">
          <div className="grid sm:grid-cols-2 gap-3">
            {ADDONS.map((a) => {
              const on = addons.includes(a.key)
              return (
                <button key={a.key} type="button" onClick={() => toggleAddon(a.key)} aria-pressed={on}
                  className={cn('flex gap-3 text-left rounded-xl border p-4 transition-all bg-background', on ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-muted-foreground/40')}>
                  <span className={cn('mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center', on ? 'bg-primary border-primary text-primary-foreground' : 'border-border')}>{on && <Check className="w-3.5 h-3.5" />}</span>
                  <span>
                    <span className="block font-semibold text-sm">{a.name} <span className="text-primary">+{formatAud(a.prices[days])}</span></span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{a.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </Step>

        <PlacementPreview key={selected?.id} event={selected} tier={tier} addons={addons} />
      </div>

      <aside className="lg:sticky lg:top-24 h-fit rounded-xl border border-border bg-background p-5 shadow-sm">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Order summary</p>
        <p className="mt-2 font-semibold truncate" title={selected?.title}>{selected?.title ?? 'No event selected'}</p>
        <p className="text-xs text-muted-foreground">{days}-day campaign · starts immediately</p>
        <div className="my-4 space-y-2 text-sm">
          {q.lines.map((l) => (
            <div key={l.key} className="flex justify-between gap-2">
              <span>{l.name}</span>
              <span className="tabular-nums">{pro && l.cents !== l.listCents && <s className="text-muted-foreground mr-1.5">{formatAud(l.listCents)}</s>}{formatAud(l.cents)}</span>
            </div>
          ))}
          {pro && q.saving > 0 && <div className="flex justify-between text-free text-xs"><span>Pro saving ({PRO_PLAN.discountPct}%)</span><span>−{formatAud(q.saving)}</span></div>}
        </div>
        <div className="flex justify-between items-baseline border-t border-border pt-3">
          <span className="font-semibold">Total</span>
          <span className="text-2xl font-bold tabular-nums">{formatAud(q.total)}</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">AUD, GST inclusive. One-off payment — no lock-in.</p>
        <button onClick={checkout} disabled={busy || !selected} className="mt-4 w-full h-11 rounded-md bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}{stripeEnabled ? 'Continue to secure checkout' : 'Activate campaign (test mode)'}
        </button>
        {!pro && (
          <p className="mt-3 text-xs text-muted-foreground flex gap-1.5"><Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-px" />With {PRO_PLAN.name} you&apos;d pay {formatAud(quote(tier, days, addons, true).total)} for this campaign.</p>
        )}
      </aside>
    </div>
  )
}
