'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { REACTION_KINDS, REACTION_LABEL, type ReactionKind } from '@/lib/reactions'
import { cn } from '@/lib/utils'

type Counts = Record<ReactionKind, number>

const EMPTY: Counts = { HOT: 0, LOVE: 0, INTERESTED: 0, EXCITED: 0, GOING: 0 }

export function EventReactions({ eventId, signedIn }: { eventId: string; signedIn: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [counts, setCounts] = useState<Counts>(EMPTY)
  const [mine, setMine] = useState<ReactionKind[]>([])
  const [busy, setBusy] = useState<ReactionKind | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    let live = true
    fetch(`/api/events/${eventId}/reactions`)
      .then((res) => res.json())
      .then((body) => {
        if (!live || !body?.enabled || body.ready === false) return
        setEnabled(true)
        setCounts({ ...EMPTY, ...body.counts })
        setMine(Array.isArray(body.mine) ? body.mine : [])
        setReady(true)
      })
      .catch(() => {})
    return () => { live = false }
  }, [eventId])

  if (!ready || !enabled) return null

  const login = `/login?next=${encodeURIComponent(pathname || `/events/${eventId}`)}`

  const toggle = async (kind: ReactionKind) => {
    if (!signedIn) {
      router.push(login)
      return
    }
    const on = !mine.includes(kind)
    setBusy(kind)
    setNote('')
    try {
      const res = await fetch(`/api/events/${eventId}/reactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, on }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNote(body.error || 'Could not save that reaction')
        return
      }
      if (body.counts) setCounts({ ...EMPTY, ...body.counts })
      if (Array.isArray(body.mine)) setMine(body.mine)
    } catch {
      setNote('That didn’t stick. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">What’s the vibe?</p>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Event reactions">
        {REACTION_KINDS.map((kind) => {
          const active = mine.includes(kind)
          const meta = REACTION_LABEL[kind]
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              disabled={busy === kind}
              onClick={() => toggle(kind)}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
                active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              <span aria-hidden>{meta.emoji}</span>
              {meta.label}
              {counts[kind] > 0 && <span className="tabular-nums">{counts[kind]}</span>}
            </button>
          )
        })}
      </div>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}
