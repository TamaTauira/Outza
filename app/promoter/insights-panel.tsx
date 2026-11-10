'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { ReachDashboard } from '@/components/reach-dashboard'
import type { ReachPayload } from '@/lib/organiser-reach-load'

export function InsightsPanel() {
  const [range, setRange] = useState('28')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [eventId, setEventId] = useState('')
  const [payload, setPayload] = useState<ReachPayload | null>(null)
  const [error, setError] = useState(false)
  const [tick, setTick] = useState(0)

  const query = useCallback(() => {
    const params = new URLSearchParams({ range })
    if (range === 'custom' && from && to) { params.set('from', from); params.set('to', to) }
    if (eventId) params.set('eventId', eventId)
    return params
  }, [range, from, to, eventId])

  useEffect(() => {
    let live = true
    const params = query()
    fetch(`/api/promoter/reach?${params}`)
      .then((res) => { if (!res.ok) throw new Error('Could not load results'); return res.json() })
      .then((data) => { if (live) { setPayload(data); setError(false) } })
      .catch((err) => { console.error(err); if (live) setError(true) })
    return () => { live = false }
  }, [query, tick])

  const csv = `/api/promoter/reach/export?${query()}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Results</h2>
          <p className="text-sm text-muted-foreground">What people did with your listings. Interest, not ticket sales.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {['7', '28', '90'].map((item) => (
            <button key={item} type="button" onClick={() => setRange(item)} className={`rounded-full px-3 py-1 text-sm ${range === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>Last {item} days</button>
          ))}
          <button type="button" onClick={() => setRange('custom')} className={`rounded-full px-3 py-1 text-sm ${range === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>Dates</button>
        </div>
      </div>
      {range === 'custom' && (
        <div className="flex flex-wrap gap-2">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From" className="h-10 rounded-md border border-border bg-background px-3 text-sm" />
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="To" className="h-10 rounded-md border border-border bg-background px-3 text-sm" />
        </div>
      )}
      {payload && payload.events.length > 1 && (
        <select value={eventId} onChange={(event) => setEventId(event.target.value)} aria-label="Which event" className="h-10 max-w-md rounded-md border border-border bg-background px-3 text-sm">
          <option value="">All my events</option>
          {payload.events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
        </select>
      )}
      {!payload && !error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Crunching the room…</p>}
      {error && <p className="text-sm text-muted-foreground">Results are having a lie-down. Try again in a minute.</p>}
      {payload && (
        <ReachDashboard
          payload={payload}
          csvHref={csv}
          onCreateLink={async (input) => {
            const res = await fetch('/api/promoter/share-links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) { toast.error(data.error || 'Could not make that link'); return }
            toast.success('Link’s ready. Copy it from the list.')
            setTick((value) => value + 1)
          }}
        />
      )}
    </div>
  )
}
