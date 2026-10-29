'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { EventImage } from '@/components/event-image'
import type { ClientImage } from '@/lib/images/spec'

interface AdminEvent {
  id: string; title: string; date: string; source: string; imageUrl: string | null; imageLocked: boolean
  imageAsset: (ClientImage & { id: string; note: string | null; score: any; enhanced: boolean; sourceUrl: string }) | null
}
interface Stats {
  status: Record<string, number>; noImage: number; review: AdminEvent[]
  localReview?: { id: string; title: string; organiserName: string; contactEmail: string; imageAsset: { status: string; note: string | null; width: number | null } | null }[]
  totals: Record<string, number | null>
  runs: { id: string; startedAt: string; endedAt: string | null; trigger: string; processed: number; ok: number; enhanced: number; rejected: number; review: number; failed: number; cached: number; unchanged: number }[]
}

const card = 'rounded-2xl bg-card shadow-sm p-5'
const btn = 'px-3 py-1.5 rounded-lg text-sm font-medium bg-foreground text-background disabled:opacity-50'
const btnGhost = 'px-3 py-1.5 rounded-lg text-sm font-medium bg-muted disabled:opacity-50'

function EventRow({ ev, onChange }: { ev: AdminEvent; onChange: (e: AdminEvent) => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const act = async (action: string, extra: Record<string, string> = {}) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, eventId: ev.id, ...extra }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Failed'); return }
      if (d.result) toast.success(`Result: ${d.result.outcome}${d.result.note ? ` - ${d.result.note}` : ''}`)
      else toast.success('Done')
      if (d.event) onChange(d.event)
      else if (action === 'unlock') onChange({ ...ev, imageLocked: false })
      setUrl('')
    } catch (e: any) {
      console.error(e)
      toast.error('Request failed')
    } finally { setBusy(false) }
  }
  const a = ev.imageAsset
  return (
    <div className="flex flex-col sm:flex-row gap-4 py-4">
      <div className="relative w-full sm:w-48 aspect-[4/3] rounded-xl overflow-hidden bg-muted shrink-0">
        <EventImage key={a?.id ?? 'none'} image={a} src={ev.imageUrl} kind="card" alt={ev.title} sizes="192px" compact />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <a href={`/events/${ev.id}`} className="font-semibold hover:underline line-clamp-1">{ev.title}</a>
        <p className="text-xs text-muted-foreground">
          {ev.date.slice(0, 10)} · {ev.source} · {a ? `${a.status}${a.width ? ` · ${a.width}×${a.height}` : ''}${a.enhanced ? ' · enhanced' : ''}` : 'not imported'}{ev.imageLocked ? ' · manually set' : ''}
        </p>
        {a?.note && <p className="text-xs text-amber-600 dark:text-amber-400">{a.note}</p>}
        {a?.score && <p className="text-[11px] font-mono text-muted-foreground">sharpness {a.score.sharpness ?? '-'} · blockiness {a.score.blockiness ?? '-'} · score {a.score.overall ?? '-'}{a.score.integrity ? ` · PSNR ${a.score.integrity.psnr}` : ''}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <button className={btnGhost} disabled={busy} onClick={() => act('regenerate')}>Re-import &amp; process</button>
          {ev.imageLocked && <button className={btnGhost} disabled={busy} onClick={() => act('unlock')}>Let source manage</button>}
        </div>
        <div className="flex gap-2 pt-1">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Official image link from the organiser" className="flex-1 min-w-0 rounded-lg bg-muted px-3 py-1.5 text-sm" />
          <button className={btn} disabled={busy || !url.trim()} onClick={() => act('replace', { url })}>Replace</button>
        </div>
      </div>
    </div>
  )
}

export function ImagesAdminClient() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [lookupId, setLookupId] = useState('')
  const [looked, setLooked] = useState<AdminEvent | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/images', { cache: 'no-store' })
      if (res.ok) setStats(await res.json())
      else toast.error('Could not load image stats')
    } catch (e) { console.error(e) }
  }, [])
  useEffect(() => { load() }, [load])

  const runPass = async () => {
    const res = await fetch('/api/admin/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run', limit: 200 }) })
    if (res.ok) toast.success('Image pass started in the background - refresh stats in a few minutes')
    else toast.error('Could not start the pass')
  }
  const lookup = async () => {
    const res = await fetch('/api/admin/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lookup', eventId: lookupId }) })
    const d = await res.json().catch(() => ({}))
    if (res.ok) setLooked(d.event)
    else toast.error(d?.error ?? 'Event not found')
  }
  const updateReview = (e: AdminEvent) => setStats((s) => (s ? { ...s, review: s.review.map((r) => (r.id === e.id ? e : r)) } : s))

  const t = stats?.totals ?? {}
  return (
    <main className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Event images</h1>
          <p className="text-muted-foreground text-sm">Source artwork is imported at the highest available resolution, checked, upscaled only when needed and verified against the original.</p>
        </div>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={load}>Refresh stats</button>
          <button className={btn} onClick={runPass}>Run image pass</button>
        </div>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {['OK', 'ENHANCED', 'LOW_RES', 'REVIEW', 'FAILED', 'PENDING'].map((k) => (
          <div key={k} className={card}>
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{k.replace('_', ' ')}</p>
            <p className="text-2xl font-bold">{stats?.status?.[k] ?? 0}</p>
          </div>
        ))}
        <div className={card}><p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">No source image</p><p className="text-2xl font-bold">{stats?.noImage ?? 0}</p></div>
        <div className={card}><p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Enhancements rejected</p><p className="text-2xl font-bold">{t.rejected ?? 0}</p><p className="text-xs text-muted-foreground">AI cost to date: ${(t.costUsd ?? 0).toFixed(2)}</p></div>
      </section>

      <section className={card}>
        <h2 className="font-semibold mb-3">Find an event</h2>
        <div className="flex gap-2">
          <input value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="Event link or ID" className="flex-1 min-w-0 rounded-lg bg-muted px-3 py-1.5 text-sm" />
          <button className={btn} disabled={!lookupId.trim()} onClick={lookup}>Look up</button>
        </div>
        {looked && <EventRow ev={looked} onChange={setLooked} />}
      </section>

      <section className={card}>
        <h2 className="font-semibold">Needs review</h2>
        <p className="text-sm text-muted-foreground mb-2">Upcoming events whose source image is too small, soft or unavailable. Ask the organiser for better artwork and paste it here.</p>
        <div className="divide-y divide-border">
          {stats?.review?.length ? stats.review.map((ev) => <EventRow key={ev.id} ev={ev} onChange={updateReview} />) : <p className="text-sm text-muted-foreground py-4">Nothing to review.</p>}
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold">VibePeep Local photos to check</h2>
        <p className="text-sm text-muted-foreground mb-2">Organiser-uploaded photos that are small, soft or couldn't be enhanced safely. The original is still shown. Email the organiser for a better image.</p>
        <div className="divide-y divide-border">
          {stats?.localReview?.length ? stats.localReview.map((l) => (
            <div key={l.id} className="py-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{l.title}</span>
              <span className="text-xs font-mono uppercase text-muted-foreground">{l.imageAsset?.status}{l.imageAsset?.width ? ` · ${l.imageAsset.width}px` : ''}</span>
              {l.imageAsset?.note && <span className="text-xs text-muted-foreground">{l.imageAsset.note}</span>}
              <a className="text-xs text-primary underline ml-auto" href={`mailto:${l.contactEmail}?subject=${encodeURIComponent(`A better photo for ${l.title} on VibePeep Local`)}`}>Email {l.organiserName}</a>
            </div>
          )) : <p className="text-sm text-muted-foreground py-4">Nothing to check.</p>}
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold mb-3">Recent runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr>{['Started', 'Trigger', 'Processed', 'OK', 'Enhanced', 'Rejected', 'Review', 'Failed', 'Cached', 'Unchanged'].map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {stats?.runs?.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{r.startedAt.slice(0, 16).replace('T', ' ')} UTC</td>
                  <td className="pr-3">{r.trigger}</td><td className="pr-3">{r.processed}</td><td className="pr-3">{r.ok}</td><td className="pr-3">{r.enhanced}</td>
                  <td className="pr-3">{r.rejected}</td><td className="pr-3">{r.review}</td><td className="pr-3">{r.failed}</td><td className="pr-3">{r.cached}</td><td className="pr-3">{r.unchanged}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!stats?.runs?.length && <p className="text-sm text-muted-foreground py-3">No runs yet - one starts automatically after each event refresh.</p>}
        </div>
      </section>
    </main>
  )
}
