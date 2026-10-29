'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Car, Check, Copy, Loader2, MapPin, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { eventPath } from '@/lib/seo'
import { togetherLeg } from '@/lib/together'
import { StopForm, emptyStop, type StopFormValues } from '@/app/itinerary/stop-form'

type Item = {
  id: string
  kind: 'event' | 'private'
  votes: number
  mine: boolean
  canEdit: boolean
  eventId: string | null
  title: string
  date: string | null
  time: string | null
  endTime: string | null
  place: string | null
  note: string | null
  venueName: string | null
  suburb: string | null
  city: string | null
  category: string | null
  lat: number | null
  lng: number | null
}
type Plan = {
  token: string
  name: string
  city: string | null
  planDate: string | null
  isCreator: boolean
  me: string
  members: string[]
  myVote: string | null
  items: Item[]
}

export function PlanClient({ token }: { token: string }) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [missing, setMissing] = useState(false)
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<{ id: string; title: string; venueName: string; date: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/together/${token}`).then(async (r) => {
      if (!r.ok) { setMissing(true); return }
      const data = await r.json()
      setPlan(data.plan)
      if (data.plan?.me && data.plan.me !== 'Guest') setName(data.plan.me)
    }).catch(() => setMissing(true))
  }, [token])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ search: q, limit: '6' })
      if (plan?.city) params.set('city', plan.city)
      fetch(`/api/events?${params}`).then((r) => r.json()).then((d) => setHits(d?.events ?? [])).catch(() => setHits([]))
    }, 250)
    return () => clearTimeout(handle)
  }, [query, plan?.city])

  const vote = async (itemId: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/together/${token}/vote`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId, name: name.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not save your vote')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your vote')
    } finally { setBusy(false) }
  }

  const add = async (eventId: string) => {
    const res = await fetch(`/api/together/${token}/items`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId }) })
    if (!res.ok) { const data = await res.json().catch(() => ({})); toast.error(data?.error ?? 'Could not add it'); return }
    setQuery('')
    setHits([])
    load()
  }
  const removeEvent = async (eventId: string) => {
    await fetch(`/api/together/${token}/items?eventId=${encodeURIComponent(eventId)}`, { method: 'DELETE' })
    load()
  }
  const saveStop = async (values: StopFormValues, id?: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/together/${token}/stops`, {
        method: id ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, title: values.title, date: values.date, time: values.time, endTime: values.endTime, address: values.where, note: values.note }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not save the stop')
      setAdding(false)
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the stop')
    } finally { setBusy(false) }
  }
  const removeStop = async (id: string) => {
    const res = await fetch(`/api/together/${token}/stops?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data?.error ?? 'Could not remove it'); return }
    load()
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Invite link copied')
    } catch { toast.error('Could not copy the link') }
  }

  if (missing) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">That plan has wandered off</h1>
        <Link href="/together" className="mt-4 inline-block text-primary underline">Start another</Link>
      </main>
    )
  }
  if (!plan) return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>

  const top = Math.max(0, ...plan.items.map((item) => item.votes))
  const blankStop = { ...emptyStop, date: plan.planDate ?? '' }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/together" className="text-sm text-muted-foreground hover:text-foreground">All plans</Link>
      <h1 className="font-display text-3xl font-bold mt-2">{plan.name}</h1>
      <p className="mt-2 text-muted-foreground">{[plan.city, plan.planDate].filter(Boolean).join(' · ') || 'City and date are optional.'} One vote each. Private stops stay on this plan. They are not listed on the board.</p>
      <button type="button" onClick={copy} className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-md border border-border text-sm font-semibold hover:bg-muted">
        <Copy className="w-4 h-4" />Copy Invite Link
      </button>

      <label className="block mt-6 text-sm font-semibold" htmlFor="voter-name">Your name on this plan</label>
      <input id="voter-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="What should we call you?" className="mt-1 w-full sm:max-w-xs h-11 rounded-md border border-border bg-background px-3 text-sm" />
      {plan.members.length > 0 && <p className="mt-2 text-sm text-muted-foreground">In the room: {plan.members.join(', ')}</p>}

      <ol className="mt-6 space-y-3">
        {plan.items.map((item, index) => {
          const next = plan.items[index + 1]
          const leg = next ? togetherLeg(
            { title: item.title, venueName: item.venueName, place: item.place, suburb: item.suburb, city: item.city, lat: item.lat, lng: item.lng },
            { title: next.title, venueName: next.venueName, place: next.place, suburb: next.suburb, city: next.city, lat: next.lat, lng: next.lng },
          ) : null
          return (
            <li key={item.id}>
              <div className="rounded-xl border border-border bg-card p-4">
                {editing === item.id ? (
                  <StopForm
                    initial={{ title: item.title, date: item.date ?? '', time: item.time ?? '', endTime: item.endTime ?? '', where: item.place ?? '', note: item.note ?? '' }}
                    submitLabel={busy ? 'Saving…' : 'Save Stop'}
                    onCancel={() => setEditing(null)}
                    onSubmit={(values) => saveStop(values, item.id)}
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {item.kind === 'private' && <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Private stop</p>}
                        {item.kind === 'event' && item.eventId ? (
                          <Link href={eventPath({ id: item.eventId, title: item.title })} className="font-semibold hover:text-primary">{item.title}</Link>
                        ) : (
                          <p className="font-semibold">{item.title}</p>
                        )}
                        <p className="text-sm text-muted-foreground mt-1">
                          {[item.date, item.time && item.endTime ? `${item.time}–${item.endTime}` : item.time, item.place].filter(Boolean).join(' · ')}
                        </p>
                        {item.note && <p className="text-sm mt-1">{item.note}</p>}
                      </div>
                      <span className="flex shrink-0">
                        {item.canEdit && <button type="button" aria-label="Edit stop" onClick={() => setEditing(item.id)} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="w-4 h-4" /></button>}
                        {(item.kind === 'event' || item.canEdit) && (
                          <button type="button" aria-label="Remove from plan" onClick={() => item.kind === 'event' && item.eventId ? removeEvent(item.eventId) : removeStop(item.id)} className="text-muted-foreground hover:text-foreground p-1"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-sm">{item.votes} {item.votes === 1 ? 'vote' : 'votes'}{top > 0 && item.votes === top ? ' · leading' : ''}</span>
                      <button type="button" disabled={busy} onClick={() => vote(item.id)} className={`h-9 px-3 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 ${item.mine ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'}`}>
                        {item.mine && <Check className="w-4 h-4" />}{item.mine ? 'Your Pick' : 'Vote for This'}
                      </button>
                    </div>
                  </>
                )}
              </div>
              {leg && (
                <div className="ml-4 my-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {leg.kind === 'same' ? <MapPin className="w-3.5 h-3.5" /> : <Car className="w-3.5 h-3.5" />}
                  <span>{leg.text}</span>
                  <a href={leg.href} target="_blank" rel="noopener noreferrer" className="text-primary underline">Directions</a>
                </div>
              )}
            </li>
          )
        })}
        {!plan.items.length && <li className="text-sm text-muted-foreground">No stops yet. Search the board, or add a private stop like drinks at a friend’s place.</li>}
      </ol>

      <section className="mt-8 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">Add your own stop</h2>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">A name, start, finish, and address. It stays on this plan and is never published as a listing.</p>
        {adding ? (
          <StopForm initial={blankStop} submitLabel={busy ? 'Adding…' : 'Add Stop'} keepDate onCancel={() => setAdding(false)} onSubmit={(values) => saveStop(values)} />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold">Add a Private Stop</button>
        )}
      </section>

      <section className="mt-8">
        <label htmlFor="plan-search" className="font-semibold text-sm">Add an event from the board</label>
        <input id="plan-search" value={query} onChange={(e) => { setQuery(e.target.value); if (e.target.value.trim().length < 2) setHits([]) }} placeholder="Search the board" className="mt-1 w-full h-11 rounded-md border border-border bg-background px-3 text-sm" />
        <ul className="mt-2 space-y-1">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button type="button" onClick={() => add(hit.id)} className="w-full text-left rounded-md px-3 py-2 hover:bg-muted text-sm">
                <span className="font-medium">{hit.title}</span>
                <span className="text-muted-foreground"> · {hit.venueName}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
