'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

type Snapshot = {
  perSuburb: { city: string; suburb: string | null; category: string | null; count: number }[]
  submitted: number
  approved: number
  approvedRate: number | null
  organic30d: number
  queue: {
    id: string
    title: string
    suburb: string | null
    city: string
    communityKey: string | null
    approvalState: string | null
    submissionState: string | null
    communityFlags: string[]
    status: string
    contactEmail: string | null
    createdAt: string
    _count: { reports: number }
    communityAudits: { id: string; action: string; detail: string | null; createdAt: string }[]
  }[]
}

export function CommunityAdminClient() {
  const [data, setData] = useState<Snapshot | null>(null)
  const load = () => fetch('/api/admin/community').then((r) => r.json()).then(setData).catch(() => toast.error('Could not load the queue'))
  useEffect(() => { load() }, [])
  const act = async (id: string, action: 'approve' | 'reject' | 'remove') => {
    const note = action === 'remove' ? 'Removed from public pages. Audit kept.' : null
    const res = await fetch('/api/admin/community', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action, note }) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(json.error ?? 'Could not update'); return }
    toast.success(action === 'remove' ? 'Removed. The listing and its history are still in the database.' : 'Updated')
    load()
  }
  if (!data) return <p className="text-sm text-muted-foreground">Loading the queue…</p>
  const rate = data.approvedRate == null ? '—' : `${Math.round(data.approvedRate * 100)}%`
  return (
    <div className="space-y-6">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-card p-4 shadow-sm"><dt className="text-xs text-muted-foreground">Approved / submitted</dt><dd className="text-2xl font-bold">{data.approved} / {data.submitted}</dd><dd className="text-sm text-muted-foreground">{rate} approved</dd></div>
        <div className="rounded-xl bg-card p-4 shadow-sm"><dt className="text-xs text-muted-foreground">Organic entrances, 30 days</dt><dd className="text-2xl font-bold">{data.organic30d}</dd></div>
        <div className="rounded-xl bg-card p-4 shadow-sm"><dt className="text-xs text-muted-foreground">Suburbs with a live listing</dt><dd className="text-2xl font-bold">{data.perSuburb.length}</dd></div>
      </dl>
      <section>
        <h2 className="font-display text-xl font-bold">Live listings by suburb</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.perSuburb.slice(0, 30).map((row) => (
            <li key={`${row.city}-${row.suburb}-${row.category}`}>{row.count} · {row.category} · {row.suburb || 'Suburb not set'}, {row.city}</li>
          ))}
          {data.perSuburb.length === 0 && <li className="text-muted-foreground">No approved community listings yet.</li>}
        </ul>
      </section>
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">Waiting on a person</h2>
        {data.queue.map((row) => (
          <article key={row.id} className="rounded-xl bg-card p-4 shadow-sm">
            <h3 className="font-semibold">{row.title}</h3>
            <p className="text-sm text-muted-foreground">{row.communityKey} · {row.suburb}, {row.city} · {row.approvalState} · {row.submissionState} · {row._count.reports} reports</p>
            <p className="text-sm text-muted-foreground">Flags: {row.communityFlags.length ? row.communityFlags.join(', ') : 'none'} · {row.contactEmail}</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {row.communityAudits.map((a) => <li key={a.id}>{a.action}{a.detail ? ` — ${a.detail}` : ''}</li>)}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => act(row.id, 'approve')} className="h-10 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Approve</button>
              <button type="button" onClick={() => act(row.id, 'reject')} className="h-10 rounded-full border border-border px-4 text-sm font-semibold">Reject</button>
              <button type="button" onClick={() => act(row.id, 'remove')} className="h-10 rounded-full border border-border px-4 text-sm font-semibold">Remove</button>
            </div>
          </article>
        ))}
        {data.queue.length === 0 && <p className="text-sm text-muted-foreground">Queue is clear.</p>}
      </section>
    </div>
  )
}
