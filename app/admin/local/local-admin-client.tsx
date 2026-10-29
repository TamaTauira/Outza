'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LOCAL_FLAG_LABEL, LOCAL_SOURCES, localCategoryLabel, fmtTime } from '@/lib/local-shared'

type L = { id: string; title: string; category: string; description: string; address: string; suburb: string; postcode: string; city: string; startDate: string; startTime: string; endTime: string; schedule: string; organiserName: string; contactEmail: string; websiteUrl: string | null; flags: string[]; reviewNote: string | null; addressVerified: boolean; reportCount: number; userId: string | null; createdAt: string }

export function LocalAdminClient() {
  const [data, setData] = useState<{ pending: L[]; recent: L[] } | null>(null)
  const load = useCallback(() => { fetch('/api/admin/local').then((r) => r.json()).then(setData).catch((e) => { console.error(e); toast.error('Could not load') }) }, [])
  useEffect(load, [load])
  const act = async (id: string, action: string) => {
    const res = await fetch('/api/admin/local', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action }) })
    if (res.ok) { toast.success('Updated'); load() } else toast.error('Failed')
  }
  const btn = 'h-8 px-3 rounded-md text-xs font-semibold'
  const Card = ({ l, pending }: { l: L; pending: boolean }) => (
    <div className="rounded-xl bg-card shadow-sm p-4 space-y-2">
      <p className="font-semibold">{l.title} <span className="font-normal text-muted-foreground text-sm">· {localCategoryLabel(l.category)} · {l.city}</span></p>
      <p className="text-sm text-muted-foreground">{l.address}, {l.suburb} {l.postcode} {l.addressVerified ? '✓ address verified' : '⚠ address unverified'} · {l.schedule} from {l.startDate} · {fmtTime(l.startTime)}–{fmtTime(l.endTime)}</p>
      <p className="text-sm whitespace-pre-wrap">{l.description}</p>
      <p className="text-xs text-muted-foreground">{l.organiserName} · {l.contactEmail} · {l.userId ? 'account' : 'no account'}{l.websiteUrl ? ` · ${l.websiteUrl}` : ''}{l.reportCount ? ` · ${l.reportCount} reports` : ''}</p>
      {l.flags.length > 0 && <div className="flex flex-wrap gap-1">{l.flags.map((f) => <span key={f} className="rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-xs">{LOCAL_FLAG_LABEL[f] ?? f}</span>)}</div>}
      {l.reviewNote && <p className="text-xs text-muted-foreground">{l.reviewNote}</p>}
      <div className="flex gap-2">
        {pending && <button className={`${btn} bg-primary text-primary-foreground`} onClick={() => act(l.id, 'APPROVE')}>Approve</button>}
        {pending && <button className={`${btn} border border-border`} onClick={() => act(l.id, 'REJECT')}>Reject</button>}
        {!pending && <button className={`${btn} border border-border`} onClick={() => act(l.id, 'REMOVE')}>Take down</button>}
      </div>
    </div>
  )
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <header>
        <h1 className="font-display text-3xl font-bold">VibePeep Local moderation</h1>
        <p className="text-muted-foreground mt-1">Community submissions flagged by duplicate, address, spam or content checks, plus visitor reports.</p>
      </header>
      <section>
        <h2 className="font-display text-xl font-bold mb-3">Waiting for review ({data?.pending.length ?? '…'})</h2>
        {data && !data.pending.length && <p className="text-sm text-muted-foreground">Nothing waiting.</p>}
        <div className="space-y-3">{data?.pending.map((l) => <Card key={l.id} l={l} pending />)}</div>
      </section>
      <section>
        <h2 className="font-display text-xl font-bold mb-3">Recently live</h2>
        <div className="space-y-3">{data?.recent.map((l) => <Card key={l.id} l={l} pending={false} />)}</div>
      </section>
      <section>
        <h2 className="font-display text-xl font-bold mb-3">Inventory sources</h2>
        <p className="text-sm text-muted-foreground mb-3">None of these is imported. Each needs a partnership, licence or approved reuse first; never bulk-copy listings or photos.</p>
        <div className="rounded-xl bg-card shadow-sm divide-y divide-border">{LOCAL_SOURCES.map((s) => <div key={s.name} className="p-3 text-sm grid sm:grid-cols-3 gap-2"><span className="font-semibold">{s.name}</span><span className="text-muted-foreground">{s.bestFor}</span><span>{s.status}</span></div>)}</div>
      </section>
    </main>
  )
}
