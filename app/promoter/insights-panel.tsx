'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { ReachDashboard } from '@/components/reach-dashboard'
import { Chip } from '@/components/ui/chip'
import { auToIso, isoToAu } from '@/lib/au-date'
import type { ReachPayload } from '@/lib/organiser-reach-load'

const LOAD_MS = 8000

function DateText({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  const [text, setText] = useState(() => isoToAu(value))
  return (
    <input
      aria-label={label}
      placeholder="dd/mm/yyyy"
      inputMode="numeric"
      autoComplete="off"
      value={text}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        if (!next.trim()) { onChange(''); return }
        const iso = auToIso(next)
        if (iso) onChange(iso)
      }}
      className="h-10 w-36 rounded-md border border-border bg-background px-3 text-sm"
    />
  )
}

export function InsightsPanel() {
  const [range, setRange] = useState('28')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [eventId, setEventId] = useState('')
  const [payload, setPayload] = useState<ReachPayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const query = useCallback(() => {
    const params = new URLSearchParams({ range })
    if (range === 'custom' && from && to) { params.set('from', from); params.set('to', to) }
    if (eventId) params.set('eventId', eventId)
    return params
  }, [range, from, to, eventId])

  useEffect(() => {
    let live = true
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), LOAD_MS)
    const params = query()
    fetch(`/api/promoter/reach?${params}`, { signal: ctrl.signal })
      .then((res) => { if (!res.ok) throw new Error('Could not load results'); return res.json() })
      .then((data) => { if (live) { setPayload(data); setError('') } })
      .catch((err) => {
        if (!live) return
        console.error(err)
        const timedOut = err instanceof Error && err.name === 'AbortError'
        setError(timedOut ? 'Results didn’t load in time.' : 'Results didn’t load. Try again.')
      })
      .finally(() => { window.clearTimeout(timer); if (live) setLoading(false) })
    return () => { live = false; window.clearTimeout(timer); ctrl.abort() }
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
            <Chip key={item} pressed={range === item} onClick={() => { setError(''); setLoading(true); setRange(item) }}>Last {item} days</Chip>
          ))}
          <Chip pressed={range === 'custom'} onClick={() => { setError(''); setLoading(true); setRange('custom') }}>Dates</Chip>
        </div>
      </div>
      {range === 'custom' && (
        <div className="flex flex-wrap gap-2">
          <DateText label="From" value={from} onChange={(iso) => { setError(''); setLoading(true); setFrom(iso) }} />
          <DateText label="To" value={to} onChange={(iso) => { setError(''); setLoading(true); setTo(iso) }} />
        </div>
      )}
      {payload && payload.events.length > 1 && (
        <select value={eventId} onChange={(event) => { setError(''); setLoading(true); setEventId(event.target.value) }} aria-label="Which event" className="h-10 max-w-md rounded-md border border-border bg-background px-3 text-sm">
          <option value="">All my events</option>
          {payload.events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
        </select>
      )}
      {loading && !error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Crunching the room…</p>}
      {error && (
        <div className="rounded-lg border border-border px-4 py-3 text-sm">
          <p>{error}</p>
          <button type="button" onClick={() => { setPayload(null); setError(''); setLoading(true); setTick((value) => value + 1) }} className="mt-2 inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-semibold">Retry</button>
        </div>
      )}
      {payload && !error && (
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
