'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Car, Compass, ExternalLink, Loader2, MapPin, Store, Utensils, Wine, X } from 'lucide-react'
import { LOCAL_AD, formatAud } from '@/lib/tiers'
import { LIMITS, LOCAL_AD_KINDS, kindLabel, type LocalAdKind } from '@/lib/local-ads-shared'
import { cn } from '@/lib/utils'

type Ad = { id: string; kind: string; businessName: string; blurb: string; address: string | null; host: string; mine: boolean }
const ICONS: Record<string, typeof Store> = { DINING: Utensils, BAR: Wine, PARKING: Car, EXPERIENCE: Compass, SERVICE: Store }
const field = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'

export function LocalRecommendations({ eventId, eventTitle, venue }: { eventId: string; eventTitle: string; venue: string }) {
  const { data: session } = useSession() || {}
  const role = (session?.user as { role?: string } | undefined)?.role
  const promoter = role === 'PROMOTER' || role === 'ADMIN'
  const [ads, setAds] = useState<Ad[]>([])
  const [slotsLeft, setSlotsLeft] = useState(0)
  const [youHaveOne, setYouHaveOne] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ kind: 'DINING' as LocalAdKind, businessName: '', blurb: '', address: '', url: '' })

  const load = useCallback(() => {
    fetch(`/api/local-ads?eventId=${encodeURIComponent(eventId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { setAds(d.ads ?? []); setSlotsLeft(d.slotsLeft ?? 0); setYouHaveOne(!!d.youHaveOne) })
      .catch((e) => console.error('Failed to load local recommendations:', e))
      .finally(() => setLoaded(true))
  }, [eventId])

  useEffect(() => {
    load()
    const p = new URLSearchParams(window.location.search).get('ad')
    if (p === 'paid') toast.success('Payment received — your recommendation is live beneath this event.')
    if (p === 'cancelled') toast('Checkout cancelled — nothing was charged')
  }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/local-ads/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, eventId }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Checkout failed')
      if (d.url) { window.location.href = d.url; return }
      toast.success('Your recommendation is live (test mode — no card charged)')
      setOpen(false); setForm({ kind: 'DINING', businessName: '', blurb: '', address: '', url: '' }); load()
    } catch (err) {
      console.error('Local ad checkout failed:', err)
      toast.error(err instanceof Error ? err.message : 'Checkout failed')
    } finally { setBusy(false) }
  }

  // Event-goers only see this section when there's something to recommend.
  if (!loaded || (!ads.length && (!promoter || slotsLeft === 0))) return null
  const canBuy = promoter && slotsLeft > 0 && !youHaveOne

  return (
    <section className="mt-8" aria-labelledby="local-recs">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h2 id="local-recs" className="font-display text-xl font-bold">Make a night of it</h2>
          <p className="text-sm text-muted-foreground">Dinner, drinks, parking and more near {venue}.</p>
        </div>
        {canBuy && !open && (
          <button onClick={() => setOpen(true)} className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold">Recommend your business here · {formatAud(LOCAL_AD.priceCents)}</button>
        )}
      </div>

      {ads.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ads.map((a) => {
            const Icon = ICONS[a.kind] ?? Store
            return (
              <a key={a.id} href={`/api/local-ads/${a.id}/go`} target="_blank" rel="sponsored noopener noreferrer" className="group rounded-xl bg-card border border-border p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 text-primary px-2.5 py-1 text-xs font-semibold"><Icon className="w-3.5 h-3.5" />Recommended · {kindLabel(a.kind)}</span>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{a.mine ? 'Your ad' : 'Sponsored'}</span>
                </div>
                <p className="mt-3 font-semibold text-foreground group-hover:text-primary transition-colors">{a.businessName}</p>
                <p className="mt-1 text-sm text-muted-foreground flex-1">{a.blurb}</p>
                {a.address && <p className="mt-3 text-xs text-muted-foreground flex items-start gap-1"><MapPin className="w-3.5 h-3.5 shrink-0 mt-px" />{a.address}</p>}
                <p className="mt-3 text-sm font-medium text-primary inline-flex items-center gap-1">Visit {a.host || 'website'} <ExternalLink className="w-3.5 h-3.5" /></p>
              </a>
            )
          })}
        </div>
      )}

      {!ads.length && !open && (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Run a restaurant, bar, car park or experience nearby? Be the first recommendation people see when they plan “{eventTitle}”.
        </div>
      )}
      {ads.length > 0 && !promoter && (
        <p className="mt-3 text-xs text-muted-foreground">Recommendations are paid placements from local businesses. <Link href="/promoters#local" className="underline">Advertise your business</Link></p>
      )}
      {ads.length > 0 && promoter && youHaveOne && <p className="mt-3 text-xs text-muted-foreground">Your recommendation is running on this event. Track it in your promoter dashboard.</p>}

      {open && (
        <form onSubmit={submit} className="mt-5 rounded-xl bg-card border border-primary/40 p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Recommend your business beneath “{eventTitle}”</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatAud(LOCAL_AD.priceCents)} one-off, AUD incl. GST. Runs until the event ends and is labelled Sponsored.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {LOCAL_AD_KINDS.map((k) => (
              <button type="button" key={k.key} onClick={() => setForm({ ...form, kind: k.key })} title={k.hint}
                className={cn('px-3 py-1.5 rounded-full text-sm border transition-colors', form.kind === k.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}>{k.label}</button>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">Business name<input required maxLength={LIMITS.businessName} className={field} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="e.g. Bella Trattoria" /></label>
            <label className="text-sm">Website or booking link<input required maxLength={LIMITS.url} className={field} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="bellatrattoria.com.au/book" /></label>
          </div>
          <label className="text-sm block">Short description <span className="text-muted-foreground">({form.blurb.length}/{LIMITS.blurb})</span>
            <textarea required minLength={10} maxLength={LIMITS.blurb} rows={2} className={field} value={form.blurb} onChange={(e) => setForm({ ...form, blurb: e.target.value })} placeholder="Pre-show set menu, 5 minutes’ walk from the venue." />
          </label>
          <label className="text-sm block">Address <span className="text-muted-foreground">(optional)</span><input maxLength={LIMITS.address} className={field} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="12 Example St, Sydney" /></label>
          <p className="text-xs text-muted-foreground">Only describe what you actually offer. Listings that are misleading or unrelated to the event may be removed. See our <Link href="/disclaimer" className="underline">disclaimer</Link>.</p>
          <button disabled={busy} className="h-11 px-5 rounded-md bg-primary text-primary-foreground font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-60">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}Pay {formatAud(LOCAL_AD.priceCents)} &amp; go live
          </button>
        </form>
      )}
    </section>
  )
}
