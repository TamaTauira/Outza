'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ExternalLink } from 'lucide-react'
import { reportReasonLabel, PROVIDER_POLICY, PERMISSION_LABEL, type PermissionStatus } from '@/lib/trust-shared'
import { sourceLabel } from '@/lib/quality'
import { eventPath } from '@/lib/seo'

type Ev = { id: string; title: string; city: string; date: string; source: string; ticketUrl: string | null; organiserUrl: string | null; status: string; promoterId: string | null }
type Report = { id: string; reason: string; details: string | null; email: string | null; createdAt: string; event: Ev }
type Claim = { id: string; orgName: string; position: string | null; evidenceUrl: string | null; message: string | null; method: string | null; createdAt: string; event: Ev; user: { email: string; name: string | null; role: string } }

const fmt = (d: string) => new Date(d).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const tone: Record<PermissionStatus, string> = { CONFIRMED: 'bg-emerald-100 text-emerald-800', TERMS_ONLY: 'bg-amber-100 text-amber-900', NEEDS_REVIEW: 'bg-red-100 text-red-800' }

function EventLine({ e }: { e: Ev }) {
  const original = e.organiserUrl || e.ticketUrl
  return (
    <p className="text-sm">
      <Link href={eventPath(e)} target="_blank" className="font-semibold hover:underline">{e.title}</Link>
      <span className="text-muted-foreground"> · {e.city} · {fmt(e.date)} · from {sourceLabel(e.source)}{e.status !== 'SCHEDULED' ? ` · ${e.status}` : ''}</span>
      {original && <a href={original} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-primary text-xs">source <ExternalLink className="w-3 h-3" /></a>}
    </p>
  )
}

export function TrustAdminClient() {
  const [data, setData] = useState<{ reports: Report[]; claims: Claim[] } | null>(null)
  const load = useCallback(() => {
    fetch('/api/admin/trust').then((r) => r.json()).then(setData).catch((e) => { console.error(e); toast.error('Could not load') })
  }, [])
  useEffect(load, [load])

  const act = async (body: object, ok: string) => {
    const res = await fetch('/api/admin/trust', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) { toast.success(ok); load() } else toast.error((await res.json().catch(() => ({})))?.error ?? 'Failed')
  }
  const btn = 'h-8 px-3 rounded-md text-xs font-semibold'

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <header>
        <h1 className="font-display text-3xl font-bold">Trust & listings</h1>
        <p className="text-muted-foreground mt-1">Visitor reports, organiser claims and the provider permission register. Check the original source before changing a listing.</p>
      </header>

      <section>
        <h2 className="font-display text-xl font-bold mb-3">Open reports ({data?.reports.length ?? '…'})</h2>
        {data && !data.reports.length && <p className="text-sm text-muted-foreground">No open reports.</p>}
        <div className="space-y-3">
          {data?.reports.map((r) => (
            <div key={r.id} className="rounded-xl bg-card shadow-sm p-4 space-y-2">
              <EventLine e={r.event} />
              <p className="text-sm"><span className="font-semibold">{reportReasonLabel(r.reason)}</span>{r.details ? ` — ${r.details}` : ''}</p>
              <p className="text-xs text-muted-foreground">{fmt(r.createdAt)} · {r.email || 'anonymous'}</p>
              <div className="flex gap-2">
                <button className={`${btn} bg-primary text-primary-foreground`} onClick={() => act({ kind: 'report', id: r.id, action: 'RESOLVED' }, 'Marked resolved')}>Resolved</button>
                <button className={`${btn} border border-border`} onClick={() => act({ kind: 'report', id: r.id, action: 'DISMISSED' }, 'Dismissed')}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold mb-3">Claims awaiting verification ({data?.claims.length ?? '…'})</h2>
        {data && !data.claims.length && <p className="text-sm text-muted-foreground">No pending claims.</p>}
        <div className="space-y-3">
          {data?.claims.map((c) => (
            <div key={c.id} className="rounded-xl bg-card shadow-sm p-4 space-y-2">
              <EventLine e={c.event} />
              <p className="text-sm"><span className="font-semibold">{c.orgName}</span>{c.position ? ` · ${c.position}` : ''} — {c.user.name || ''} &lt;{c.user.email}&gt; ({c.user.role.toLowerCase()})</p>
              {c.evidenceUrl && <a href={c.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1">{c.evidenceUrl} <ExternalLink className="w-3 h-3" /></a>}
              {c.message && <p className="text-sm text-muted-foreground whitespace-pre-line">{c.message}</p>}
              {c.event.promoterId && <p className="text-xs text-red-700">This listing already has a promoter. Approving will replace them.</p>}
              <div className="flex gap-2">
                <button className={`${btn} bg-primary text-primary-foreground`} onClick={() => act({ kind: 'claim', id: c.id, action: 'APPROVE' }, 'Organiser verified')}>Approve</button>
                <button className={`${btn} border border-border`} onClick={() => act({ kind: 'claim', id: c.id, action: 'REJECT', note: 'Could not verify' }, 'Claim rejected')}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold mb-1">Provider reuse permissions</h2>
        <p className="text-sm text-muted-foreground mb-3">Internal checklist, not legal advice. Statuses live in lib/trust-shared.ts; update them once a provider’s terms or a written licence is confirmed.</p>
        <div className="rounded-xl bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground text-xs"><th className="p-3">Provider</th><th className="p-3">Event data</th><th className="p-3">Images</th><th className="p-3">Obligations</th><th className="p-3">To confirm</th></tr></thead>
            <tbody>
              {Object.entries(PROVIDER_POLICY).map(([k, p]) => (
                <tr key={k} className="border-t border-border/60 align-top">
                  <td className="p-3"><p className="font-semibold">{p.name}</p><p className="text-xs text-muted-foreground">{p.access}</p>{p.termsUrl && <a href={p.termsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary">Terms</a>}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone[p.data]}`}>{PERMISSION_LABEL[p.data]}</span></td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone[p.images]}`}>{PERMISSION_LABEL[p.images]}</span></td>
                  <td className="p-3 text-xs text-muted-foreground">{p.obligations.join('; ')}</td>
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
