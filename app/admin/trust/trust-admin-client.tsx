'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ExternalLink } from 'lucide-react'
import { PROVIDER_POLICY, PERMISSION_LABEL, type PermissionStatus } from '@/lib/trust-shared'
import { eventPath } from '@/lib/seo'
import { toggleAll, toggleSelection } from '@/lib/trust-queue'

type Ev = { id: string; title: string; city: string; date: string; source: string; ticketUrl: string | null; sourceUrl: string | null; organiserUrl: string | null; status: string }
type Item = {
  key: string
  kind: 'report' | 'claim' | 'flag'
  id: string
  issue: string
  note: string | null
  source: string | null
  createdAt: string
  event: Ev | null
  who: string
}

const fmt = (d: string) => new Date(d).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const tone: Record<PermissionStatus, string> = { CONFIRMED: 'bg-emerald-100 text-emerald-800', TERMS_ONLY: 'bg-amber-100 text-amber-900', NEEDS_REVIEW: 'bg-red-100 text-red-800' }

function HealthStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  )
}

export function TrustAdminClient() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [pending, setPending] = useState(0)
  const [picked, setPicked] = useState<string[]>([])
  const [health, setHealth] = useState<{ reports: number; views: number; reportsPerThousand: number | null; searchClicks: number; refreshCompleted: number; refreshFailed: number; refreshSuccessRate: number | null } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch('/api/admin/trust').then((r) => r.json()).then((d) => {
      setItems(d?.items ?? [])
      setPending(d?.pending ?? 0)
      setHealth(d?.health ?? null)
      setPicked([])
    }).catch((e) => { console.error(e); toast.error('Could not load') })
  }, [])
  useEffect(() => { load() }, [load])

  const keys = items?.map((item) => item.key) ?? []
  const allOn = keys.length > 0 && keys.every((key) => picked.includes(key))

  const act = async (action: 'approve' | 'dismiss') => {
    const chosen = items?.filter((item) => picked.includes(item.key)).map((item) => ({ kind: item.kind, id: item.id })) ?? []
    if (!chosen.length) { toast.error('Select at least one item'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/trust', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, items: chosen }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not update')
      toast.success(action === 'approve' ? `Approved ${data.done ?? chosen.length}` : `Dismissed ${data.done ?? chosen.length}`)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update')
    } finally { setBusy(false) }
  }

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      <header>
        <h1 className="font-display text-3xl font-bold">Trust & listings</h1>
        <p className="text-muted-foreground mt-1">{pending} waiting on you. Check the original source before you approve a change. Nothing here is deleted. A flag is a heuristic, not a guarantee.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <HealthStat label="Incorrect-detail reports per 1,000 views" value={health?.reportsPerThousand == null ? '—' : String(health.reportsPerThousand)} note={health ? `${health.reports} reports · ${health.views.toLocaleString('en-AU')} views` : 'Loading'} />
        <HealthStat label="Search-result clicks" value={health ? health.searchClicks.toLocaleString('en-AU') : '—'} note="Counted when someone opens a listing from search" />
        <HealthStat label="Data-refresh success rate" value={health?.refreshSuccessRate == null ? '—' : `${health.refreshSuccessRate}%`} note={health ? `${health.refreshCompleted} completed · ${health.refreshFailed} failed, last 7 days` : 'Loading'} />
      </section>

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <label className="inline-flex items-center gap-2 text-sm font-semibold min-h-11">
            <input type="checkbox" className="w-4 h-4 accent-[hsl(var(--primary))]" checked={allOn} onChange={() => setPicked(toggleAll(picked, keys))} aria-label="Select all" />
            Select all
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={busy || !picked.length} onClick={() => act('approve')} className="h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">Approve selected</button>
            <button type="button" disabled={busy || !picked.length} onClick={() => act('dismiss')} className="h-11 px-4 rounded-md border border-border text-sm font-semibold disabled:opacity-50">Dismiss selected</button>
          </div>
        </div>
        {items && !items.length && <p className="text-sm text-muted-foreground">Nothing needs a decision.</p>}
        <ul className="space-y-3">
          {items?.map((item) => {
            const original = item.event?.sourceUrl || item.event?.organiserUrl || item.event?.ticketUrl
            return (
              <li key={item.key} className="rounded-xl bg-card border border-border p-4 flex items-start gap-3">
                <input type="checkbox" className="mt-1 w-4 h-4 shrink-0 accent-[hsl(var(--primary))]" checked={picked.includes(item.key)} onChange={() => setPicked(toggleSelection(picked, item.key))} aria-label={`Select ${item.issue}`} />
                <div className="min-w-0">
                  <p className="font-semibold">{item.issue}</p>
                  {item.event ? (
                    <p className="text-sm mt-1">
                      <Link href={eventPath(item.event)} target="_blank" className="font-semibold hover:underline">{item.event.title}</Link>
                      <span className="text-muted-foreground"> · {item.event.city} · {fmt(item.event.date)} · {item.source}{item.event.status !== 'SCHEDULED' ? ` · ${item.event.status}` : ''}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">{item.source}</p>
                  )}
                  {item.note && <p className="text-sm mt-1 whitespace-pre-line">{item.note}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{fmt(item.createdAt)} · {item.who}</p>
                  {original && <a href={original} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary">Original listing <ExternalLink className="w-3 h-3" /></a>}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold mb-1">Provider reuse permissions</h2>
        <p className="text-sm text-muted-foreground mb-3">Internal checklist, not legal advice. Statuses live in lib/trust-shared.ts.</p>
        <div className="rounded-xl bg-card border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="text-left text-muted-foreground text-xs"><th className="p-3">Provider</th><th className="p-3">Event data</th><th className="p-3">Images</th><th className="p-3">To confirm</th></tr></thead>
            <tbody>
              {Object.entries(PROVIDER_POLICY).map(([k, p]) => (
                <tr key={k} className="border-t border-border/60 align-top">
                  <td className="p-3 font-semibold">{p.name}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone[p.data]}`}>{PERMISSION_LABEL[p.data]}</span></td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone[p.images]}`}>{PERMISSION_LABEL[p.images]}</span></td>
                  <td className="p-3 text-xs text-muted-foreground">{p.toConfirm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
