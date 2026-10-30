'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, Megaphone } from 'lucide-react'
import { BOOSTS, type BoostId, ATTRIBUTION_NOTE } from '@/lib/sponsorship'
import { formatAud } from '@/lib/tiers'

type Ev = { id: string; title: string; date: string; city?: string; category?: string; venueName: string }
type CatalogBoost = (typeof BOOSTS)[BoostId]
type CampaignRow = {
  id: string
  status: string
  inventoryId: string
  inventoryName: string
  eventId: string
  eventTitle: string
  city: string
  category: string
  startsAt: string
  endsAt: string
  impressionCap: number
  impressions: number
  detailViews: number
  ticketClicks: number
  repeatInterest: number
  amountCents: number
  spendCapCents: number
  headline: string
  blurb: string
  refundable: boolean
  refundReason: string
}

const field = 'h-11 w-full rounded-md border border-border bg-background px-3 text-base sm:text-sm'
const localValue = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function BoostStudio({ events, pro }: { events: Ev[]; pro: boolean }) {
  const [boosts, setBoosts] = useState<CatalogBoost[]>(Object.values(BOOSTS))
  const [paymentsOn, setPaymentsOn] = useState<boolean | null>(null)
  const [rows, setRows] = useState<CampaignRow[]>([])
  const [canExport, setCanExport] = useState(false)
  const [canPause, setCanPause] = useState(false)
  const [attribution, setAttribution] = useState(ATTRIBUTION_NOTE)
  const [eventId, setEventId] = useState(events[0]?.id ?? '')
  const [inventoryId, setInventoryId] = useState<BoostId>('EVENING')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [cap, setCap] = useState('')
  const [headline, setHeadline] = useState('')
  const [blurb, setBlurb] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState(false)

  const load = async () => {
    const [catalog, mine] = await Promise.all([
      fetch('/api/sponsorships/catalog').then((r) => r.json()).catch(() => null),
      fetch('/api/promoter/campaigns').then((r) => r.json()).catch(() => null),
    ])
    if (catalog?.boosts?.length) setBoosts(catalog.boosts)
    if (typeof catalog?.paymentsEnabled === 'boolean') setPaymentsOn(catalog.paymentsEnabled)
    if (mine?.campaigns) setRows(mine.campaigns)
    setCanExport(!!mine?.canExport)
    setCanPause(!!mine?.canPause)
    if (mine?.attribution) setAttribution(mine.attribution)
  }

  useEffect(() => {
    const startAt = new Date(Date.now() + 60 * 60000)
    startAt.setMinutes(0, 0, 0)
    setStart(localValue(startAt))
    setEnd(localValue(new Date(startAt.getTime() + 4 * 3600000)))
    load().catch((error) => console.error('Boosts failed to load', error))
    const params = new URLSearchParams(window.location.search)
    if (params.get('boost') === '1') {
      const sessionId = params.get('session_id')
      if (sessionId) {
        fetch('/api/sponsorships/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) })
          .then(() => load())
          .catch((error) => console.error('Payment confirm failed', error))
      }
      toast.success('Payment received. The boost goes live once the charge is confirmed. Refresh if it still says pending.')
    }
  }, [])

  const product = boosts.find((row) => row.id === inventoryId) ?? BOOSTS.EVENING
  const selected = events.find((row) => row.id === eventId)
  const price = pro ? Math.round(product.priceCents * 0.85) : product.priceCents
  const when = useMemo(() => {
    if (!start || !end) return ''
    const s = new Date(start)
    const e = new Date(end)
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return ''
    const fmt = (d: Date) => d.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    return `${fmt(s)} → ${fmt(e)}`
  }, [start, end])

  const renew = (row: CampaignRow) => {
    setEventId(row.eventId)
    if (row.inventoryId === 'EVENING' || row.inventoryId === 'DAY_PASS') setInventoryId(row.inventoryId)
    setHeadline(row.headline)
    setBlurb(row.blurb)
    setCap(String(row.impressionCap))
    setConsent(false)
    setPreview(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const pay = async () => {
    if (!selected) { toast.error('Choose an event first'); return }
    if (!preview) { setPreview(true); return }
    if (!consent) { toast.error('Tick the box. We will not charge you without it.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/sponsorships/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: selected.id,
          inventoryId,
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(end).toISOString(),
          impressionCap: cap ? Number(cap) : undefined,
          headline,
          blurb,
          consent: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.payments === 'soon') { setPaymentsOn(false); toast('Payments coming soon. Ask for a quote instead. Nothing was charged.'); return }
      if (!res.ok) throw new Error(data?.error ?? 'Checkout failed')
      if (data.url) { window.location.href = data.url; return }
      throw new Error('Checkout did not return a payment page')
    } catch (error) {
      console.error('Boost checkout failed', error)
      toast.error(error instanceof Error ? error.message : 'Checkout failed')
    } finally { setBusy(false) }
  }

  const quote = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/sponsorships/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'BOOST', email, note, eventId, inventoryId, headline }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not send that')
      toast.success('Quote requested. Nothing was charged.')
      setNote('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send that')
    } finally { setBusy(false) }
  }

  const act = async (action: 'pause' | 'resume' | 'refund', id: string) => {
    if (action === 'refund' && !window.confirm('Refund this unshown boost to the card that paid?')) return
    const res = await fetch('/api/promoter/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, id, consent: action === 'refund' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data?.error ?? 'Could not update that boost'); return }
    toast.success(action === 'refund' ? 'Refund sent' : action === 'pause' ? 'Boost paused' : 'Boost is live again')
    load().catch(() => {})
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-xl font-bold">Short boosts</h2>
        <p className="mt-1 text-sm text-muted-foreground">An evening or a day in the Hot right now band, on top of the 7, 14 and 30 day packages. You pick the event, the window and the words. We show you the card before anyone pays.</p>
      </div>

      {!events.length ? (
        <p className="text-sm text-muted-foreground">You need an upcoming event on the dashboard before a boost has somewhere to sit.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            <label className="block text-sm font-medium">Event
              <select value={eventId} onChange={(e) => { setEventId(e.target.value); setPreview(false) }} className={`${field} mt-1`} aria-label="Event to boost">
                {events.map((row) => <option key={row.id} value={row.id}>{row.title}{row.city ? ` · ${row.city}` : ''}</option>)}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {boosts.map((row) => (
                <button key={row.id} type="button" onClick={() => { setInventoryId(row.id as BoostId); setPreview(false) }} aria-pressed={inventoryId === row.id}
                  className={`rounded-xl border p-4 text-left ${inventoryId === row.id ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`}>
                  <p className="font-semibold">{row.name}</p>
                  <p className="mt-1 text-lg font-bold">{formatAud(pro ? Math.round(row.priceCents * 0.85) : row.priceCents)} <span className="text-xs font-normal text-muted-foreground">AUD incl. GST{pro ? ' · Pro price' : ''}</span></p>
                  <p className="mt-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Guaranteed. </span>{row.guaranteed}</p>
                  <p className="mt-1 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Estimated. </span>{row.estimated}</p>
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">Starts
                <input type="datetime-local" value={start} onChange={(e) => { setStart(e.target.value); setPreview(false) }} className={`${field} mt-1`} />
              </label>
              <label className="block text-sm font-medium">Ends
                <input type="datetime-local" value={end} onChange={(e) => { setEnd(e.target.value); setPreview(false) }} className={`${field} mt-1`} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Times use your device clock. {product.name} runs for at most {product.maxMinutes / 60} hours. Aimed at {selected?.category || 'the event’s category'} in {selected?.city || 'the event’s city'}.</p>
            <label className="block text-sm font-medium">Impression cap <span className="font-normal text-muted-foreground">(optional, up to {product.impressionCap.toLocaleString('en-AU')})</span>
              <input inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ''))} placeholder={String(product.impressionCap)} className={`${field} mt-1`} aria-label="Impression cap" />
            </label>
            <label className="block text-sm font-medium">Card headline
              <input value={headline} onChange={(e) => { setHeadline(e.target.value); setPreview(false) }} maxLength={80} placeholder="Late set, cold drinks, good shoes" className={`${field} mt-1`} />
            </label>
            <label className="block text-sm font-medium">Extra line <span className="font-normal text-muted-foreground">(optional)</span>
              <input value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={140} className={`${field} mt-1`} />
            </label>
            {preview && selected && (
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                <div className="mt-3 max-w-sm rounded-xl border border-border p-3 shadow-sm">
                  <span className="rounded bg-black px-1.5 py-0.5 text-[10px] font-bold text-white">Sponsored</span>
                  <p className="mt-2 text-sm font-semibold">{headline || 'Your headline'}</p>
                  <p className="text-sm">{selected.title}</p>
                  <p className="text-xs text-muted-foreground">{selected.venueName}{selected.city ? ` · ${selected.city}` : ''} · {selected.category}</p>
                  {blurb && <p className="mt-1 text-xs">{blurb}</p>}
                  <p className="mt-2 text-[11px] text-muted-foreground">{when || 'Pick a start and an end'}</p>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">The event title stays the real one. The headline is the sponsored line. Get tickets on the event page is unchanged.</p>
              </div>
            )}
          </div>
          <aside className="h-fit rounded-xl border border-border bg-background p-5 lg:sticky lg:top-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">This boost</p>
            <p className="mt-2 font-semibold">{product.name}</p>
            <p className="text-2xl font-bold tabular-nums">{formatAud(price)}</p>
            <p className="text-xs text-muted-foreground">Spend cap {formatAud(price)}. One charge. It does not renew.</p>
            {paymentsOn === false ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">Payments coming soon</p>
                <p className="text-xs text-muted-foreground">Leave a quote request. This does not charge a card and does not put the boost live.</p>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@venue.com" className={field} aria-label="Email for the quote" />
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Which night, which room" rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                <button type="button" onClick={quote} disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border text-sm font-semibold disabled:opacity-60">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}Request a quote
                </button>
              </div>
            ) : (
              <>
                <label className="mt-4 flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
                  <span>Charge my card {formatAud(price)} AUD once. This is not a subscription and there is no trial.</span>
                </label>
                <button type="button" onClick={pay} disabled={busy} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}{preview ? `Pay ${formatAud(price)}` : 'Preview the card'}
                </button>
              </>
            )}
          </aside>
        </div>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Your boost results</h3>
          {canExport && <a href="/api/promoter/campaigns/export" className="text-sm font-semibold text-primary hover:underline">Download CSV</a>}
        </div>
        <p className="mb-4 text-xs text-muted-foreground">{attribution}</p>
        {!rows.length ? <p className="text-sm text-muted-foreground">No short boosts yet. The multi-day packages still live under Promote an event.</p> : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{row.eventTitle}</p>
                    <p className="text-xs text-muted-foreground">{row.inventoryName} · {row.city} · {row.category} · <span className="uppercase">{row.status}</span></p>
                    <p className="text-xs text-muted-foreground">{row.headline}</p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{formatAud(row.amountCents)}</p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div><dt className="text-xs text-muted-foreground">Impressions</dt><dd className="font-semibold tabular-nums">{row.impressions.toLocaleString('en-AU')} / {row.impressionCap.toLocaleString('en-AU')}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Detail views</dt><dd className="font-semibold tabular-nums">{row.detailViews.toLocaleString('en-AU')}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Get tickets</dt><dd className="font-semibold tabular-nums">{row.ticketClicks.toLocaleString('en-AU')}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Repeat interest</dt><dd className="font-semibold tabular-nums">{row.repeatInterest.toLocaleString('en-AU')}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => renew(row)} className="h-9 rounded-md border border-border px-3 text-xs font-semibold">Run it again</button>
                  {row.status !== 'PENDING' && row.status !== 'CANCELLED' && (
                    <Link href={`/promoter/invoice/${row.id}`} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-semibold">Invoice</Link>
                  )}
                  {row.refundable && <button type="button" onClick={() => act('refund', row.id)} className="h-9 rounded-md border border-border px-3 text-xs font-semibold">Refund</button>}
                  {canPause && row.status === 'ACTIVE' && <button type="button" onClick={() => act('pause', row.id)} className="h-9 rounded-md border border-border px-3 text-xs font-semibold">Pause</button>}
                  {canPause && row.status === 'PAUSED' && <button type="button" onClick={() => act('resume', row.id)} className="h-9 rounded-md border border-border px-3 text-xs font-semibold">Resume</button>}
                </div>
                {!row.refundable && row.refundReason && row.status === 'ACTIVE' && <p className="mt-2 text-[11px] text-muted-foreground">{row.refundReason}</p>}
              </li>
            ))}
          </ul>
        )}
        {canPause && <button type="button" onClick={async () => { const res = await fetch('/api/promoter/campaigns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'pause', all: true }) }); const data = await res.json().catch(() => ({})); if (!res.ok) toast.error(data?.error ?? 'Could not pause'); else { toast.success('Live boosts paused'); load().catch(() => {}) } }} className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground underline">
          <Megaphone className="h-3.5 w-3.5" />Pause every live boost
        </button>}
      </section>
    </div>
  )
}
