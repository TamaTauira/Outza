'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

type Payload = {
  claims: Array<{ id: string; status: string; fullName: string; businessEmail: string; roleAtVenue: string | null; riskNote: string | null; evidenceReference: string | null; venue: { name: string; city: string }; user: { email: string } }>
  changes: Array<{ id: string; fieldName: string; proposedValue: string; venue: { name: string } }>
  reports: Array<{ id: string; reason: string; caution: boolean; event: { title: string; status: string }; venue: { name: string } }>
}

export function VenueAdmin() {
  const [data, setData] = useState<Payload | null>(null)
  const load = () => { fetch('/api/admin/venues').then((r) => r.json()).then(setData).catch(() => {}) }
  useEffect(() => { load() }, [])

  const act = async (body: object) => {
    const res = await fetch('/api/admin/venues', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) { toast.error('Could not save that'); return }
    load()
  }

  if (!data) return <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
  return (
    <div className="mt-4 space-y-6 text-sm">
      <section>
        <h2 className="font-semibold">Claims and disputes</h2>
        {!data.claims.length && <p className="text-muted-foreground">None waiting.</p>}
        {data.claims.map((claim) => (
          <article key={claim.id} className="mt-2 rounded-xl border border-border p-3">
            <p className="font-medium">{claim.venue.name}, {claim.venue.city}</p>
            <p>{claim.fullName} · {claim.businessEmail} · {claim.status}</p>
            {claim.roleAtVenue && <p className="text-muted-foreground">{claim.roleAtVenue}</p>}
            {claim.riskNote && <p className="text-muted-foreground">{claim.riskNote}</p>}
            <div className="mt-2 flex gap-2">
              <button type="button" className="underline" onClick={() => act({ kind: 'claim', id: claim.id, action: 'approve' })}>Approve</button>
              <button type="button" className="underline" onClick={() => act({ kind: 'claim', id: claim.id, action: 'reject' })}>Reject</button>
            </div>
          </article>
        ))}
      </section>
      <section>
        <h2 className="font-semibold">Identity changes</h2>
        {data.changes.map((change) => (
          <article key={change.id} className="mt-2 rounded-xl border border-border p-3">
            <p>{change.venue.name} · {change.fieldName}</p>
            <p className="text-muted-foreground break-words">{change.proposedValue}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="underline" onClick={() => act({ kind: 'change', id: change.id, action: 'approve' })}>Apply</button>
              <button type="button" className="underline" onClick={() => act({ kind: 'change', id: change.id, action: 'reject' })}>Reject</button>
            </div>
          </article>
        ))}
      </section>
      <section>
        <h2 className="font-semibold">Event reports from venues</h2>
        {data.reports.map((report) => (
          <article key={report.id} className="mt-2 rounded-xl border border-border p-3">
            <p>{report.venue.name} reported {report.event.title}</p>
            <p className="text-muted-foreground">{report.reason} · listing status {report.event.status}{report.caution ? ' · caution on the public page' : ''}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="underline" onClick={() => act({ kind: 'report', id: report.id, action: 'resolve' })}>Resolve</button>
              <button type="button" className="underline" onClick={() => act({ kind: 'report', id: report.id, action: 'dismiss' })}>Dismiss</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
