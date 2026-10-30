'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'

type Payload = {
  choices: {
    heading: string
    body: string
    primary: { label: string; href: string | null; kind: string }
    secondary: { label: string }
    direct: { title: string; body: string; continueLabel: string; sourceLabel: string }
  }
  acknowledged: boolean
  notice: { title: string; body: string } | null
  diffs: Array<{ field: string; source: string | null; displayed: string | null }>
  history: Array<{ fieldName: string; action: string; previousValue: string | null; updatedValue: string | null; createdAt: string }>
  event: { id: string; title: string; materialConflict: string | null }
}

const fieldClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'

export function ManageEvent({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'choice' | 'notice' | 'editor' | 'history'>('choice')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState(false)

  const load = () => {
    fetch(`/api/events/${eventId}/overrides`).then(async (res) => {
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'You can’t manage this event.'); return }
      setData(body)
      const next: Record<string, string> = {}
      for (const row of body.diffs || []) next[row.field] = row.displayed || ''
      setDraft(next)
      setMode(body.acknowledged ? 'choice' : 'choice')
    }).catch(() => setError('Could not load this event.'))
  }
  useEffect(() => { load() }, [eventId])

  if (error) return <p className="text-sm">{error}</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading the listing…</p>

  const goDirect = async () => {
    if (!data.acknowledged) setMode('notice')
    else setMode('editor')
  }

  const ack = async () => {
    const res = await fetch(`/api/events/${eventId}/overrides`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ack: true }) })
    if (!res.ok) { toast.error('Could not save that preference'); return }
    setData({ ...data, acknowledged: true })
    setMode('editor')
  }

  const save = async () => {
    const fields: Record<string, string> = {}
    for (const row of data.diffs) {
      if ((draft[row.field] || '') !== (row.displayed || '')) fields[row.field] = draft[row.field] || ''
    }
    const res = await fetch(`/api/events/${eventId}/overrides`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields, confirmed }) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error || 'Could not save'); return }
    toast.success('Saved on VibePeep. The original source is unchanged.')
    setConfirmed(false)
    load()
  }

  const restore = async (field: string) => {
    const res = await fetch(`/api/events/${eventId}/overrides`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ restore: field }) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error || 'Could not restore that field'); return }
    toast.success('That field is back to the source.')
    load()
  }

  return (
    <div className="space-y-4">
      <Link href={`/events/${eventId}`} className="text-sm text-muted-foreground underline">Back to the listing</Link>
      <h1 className="font-display text-2xl font-bold">{data.event.title}</h1>
      {data.notice && <p className="text-sm text-muted-foreground">Some details have been updated directly in VibePeep.</p>}
      {data.event.materialConflict && <p className="text-sm">The original source disagrees on something important. Check it before you treat the listing as confirmed.</p>}

      {mode === 'choice' && (
        <section className="rounded-xl border border-border p-4 space-y-3">
          <h2 className="font-semibold">{data.choices.heading}</h2>
          <p className="text-sm text-muted-foreground">{data.choices.body}</p>
          {data.choices.primary.href ? (
            <a href={data.choices.primary.href} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">{data.choices.primary.label}</a>
          ) : (
            <p className="text-sm">We don’t have an original link for this one yet.</p>
          )}
          <button type="button" onClick={goDirect} className="block text-sm underline">{data.choices.secondary.label}</button>
        </section>
      )}

      {mode === 'notice' && (
        <section className="rounded-xl border border-border p-4 space-y-3">
          <h2 className="font-semibold">{data.choices.direct.title}</h2>
          <p className="text-sm text-muted-foreground">{data.choices.direct.body}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={ack} className="h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold">{data.choices.direct.continueLabel}</button>
            {data.choices.primary.href && <a href={data.choices.primary.href} target="_blank" rel="noopener noreferrer" className="h-11 px-4 inline-flex items-center rounded-md border border-border text-sm">{data.choices.direct.sourceLabel}</a>}
          </div>
        </section>
      )}

      {mode === 'editor' && (
        <section className="space-y-3">
          <p className="text-xs text-muted-foreground">Changing the date, time, place, or cancellation asks you to confirm before it publishes.</p>
          {data.diffs.map((row) => (
            <label key={row.field} className="block text-sm">
              <span className="text-xs text-muted-foreground">{row.field}{row.source && row.source !== row.displayed ? ` · source: ${row.source}` : ''}</span>
              <input className={`${fieldClass} mt-1`} aria-label={row.field} value={draft[row.field] ?? ''} onChange={(e) => setDraft({ ...draft, [row.field]: e.target.value })} />
              {row.source && row.source !== row.displayed && <button type="button" className="text-xs underline mt-1" onClick={() => restore(row.field)}>Restore source</button>}
            </label>
          ))}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I’ve checked date, time, place, and cancellation changes.</label>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold">Publish on VibePeep</button>
            <button type="button" onClick={() => setMode('history')} className="h-11 px-4 rounded-md border border-border text-sm">View Edit History</button>
          </div>
          <Link href={`/promoter?tab=promote&event=${eventId}`} className="text-sm underline">Promote Event</Link>
        </section>
      )}

      {mode === 'history' && (
        <section className="space-y-2">
          <button type="button" className="text-sm underline" onClick={() => setMode('editor')}>Back to editing</button>
          {!data.history.length && <p className="text-sm text-muted-foreground">No direct edits yet.</p>}
          {data.history.map((row, index) => (
            <p key={`${row.createdAt}-${index}`} className="text-sm">{row.createdAt.slice(0, 10)} · {row.fieldName} · {row.action} · {row.previousValue || '—'} → {row.updatedValue || '—'}</p>
          ))}
        </section>
      )}
    </div>
  )
}
