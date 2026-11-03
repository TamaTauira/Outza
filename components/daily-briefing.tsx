'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { EDITIONS, EDITION_LABEL, type Edition } from '@/lib/daily-editions'

type Item = { id: string; title: string; when: string; where: string; line: string; path: string; note: string | null }

type Payload = {
  enabled?: boolean
  city?: string
  edition?: Edition
  intro?: string
  items?: Item[]
  outro?: string
  empty?: string | null
  personalised?: boolean
  personalNote?: string | null
  playback?: boolean
  audioUrl?: string | null
}

export function DailyBriefing({ city }: { city: string }) {
  const [edition, setEdition] = useState<Edition>('today')
  const [payload, setPayload] = useState<Payload | null>(null)

  useEffect(() => {
    if (!city) return
    let live = true
    fetch(`/api/daily?city=${encodeURIComponent(city)}&edition=${edition}`)
      .then((res) => res.json())
      .then((body) => { if (live) setPayload(body) })
      .catch(() => { if (live) setPayload({ enabled: true, city, edition, empty: 'The briefing could not be loaded.', items: [] }) })
    return () => { live = false }
  }, [city, edition])

  if (!city || payload?.enabled === false) return null
  const showing = payload?.city === city && payload.edition === edition ? payload : null

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Daily briefing">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Daily briefing</h2>
          <p className="mt-1 text-sm text-muted-foreground">A short list of what is actually listed. It is not a review.</p>
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Briefing edition">
          {EDITIONS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={edition === key}
              onClick={() => setEdition(key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${edition === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              {EDITION_LABEL[key]}
            </button>
          ))}
        </div>
      </div>

      {!showing && <p className="mt-3 text-sm text-muted-foreground">Loading the briefing…</p>}
      {showing && (
        <div className="mt-3 space-y-3">
          {showing.playback && showing.audioUrl && (
            <audio controls preload="none" src={showing.audioUrl} className="w-full">
              Your browser cannot play this recording. The written briefing is below.
            </audio>
          )}
          {showing.intro && <p className="text-sm">{showing.intro}</p>}
          {showing.personalNote && <p className="text-xs text-muted-foreground">{showing.personalNote}</p>}
          {showing.empty && <p className="text-sm text-muted-foreground">{showing.empty}</p>}
          {!!showing.items?.length && (
            <ol className="space-y-3">
              {showing.items.map((item) => (
                <li key={item.id} className="text-sm">
                  <Link href={item.path} className="font-semibold hover:text-primary">{item.title}</Link>
                  <p className="text-muted-foreground">{item.when} · {item.where}</p>
                  <p>{item.line}</p>
                  {item.note && <p className="text-xs text-primary">{item.note}</p>}
                </li>
              ))}
            </ol>
          )}
          {showing.outro && <p className="text-xs text-muted-foreground">{showing.outro}</p>}
        </div>
      )}
    </section>
  )
}
