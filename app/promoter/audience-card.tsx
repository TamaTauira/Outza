'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bookmark, CalendarClock, Heart, Loader2, MapPin, Route, Share2, ShieldCheck, Users } from 'lucide-react'
import type { AudienceInsights, Share, TopEvent } from '@/lib/audience-insights'
import { AUDIENCE_DISCLAIMER, MIN_GROUP } from '@/lib/profile-shared'
function Bars({ title, Icon, items, empty }: { title: string; Icon: typeof Users; items: Share[]; empty: string }) {
  return (
    <div className="rounded-lg bg-background border border-border p-4">
      <p className="font-semibold text-sm flex items-center gap-2 mb-3"><Icon className="w-4 h-4 text-primary" />{title}</p>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.label} className="text-xs">
              <div className="flex justify-between gap-2"><span className="truncate">{s.label}</span><span className="font-semibold tabular-nums">{s.pct}%</span></div>
              <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, s.pct)}%` }} /></div>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-muted-foreground">{empty}</p>}
    </div>
  )
}

function Top({ title, Icon, items, unit }: { title: string; Icon: typeof Users; items: TopEvent[]; unit: string }) {
  return (
    <div className="rounded-lg bg-background border border-border p-4">
      <p className="font-semibold text-sm flex items-center gap-2 mb-3"><Icon className="w-4 h-4 text-primary" />{title}</p>
      {items.length ? (
        <ol className="space-y-1.5">
          {items.map((e, i) => (
            <li key={e.id} className="text-xs flex justify-between gap-2">
              <Link href={`/events/${e.id}`} className="truncate hover:text-primary">{i + 1}. {e.title}</Link>
              <span className="shrink-0 font-semibold tabular-nums">{e.count} {unit}</span>
            </li>
          ))}
        </ol>
      ) : <p className="text-xs text-muted-foreground">Nothing has hit {MIN_GROUP}+ yet.</p>}
    </div>
  )
}

export function AudienceCard() {
  const [data, setData] = useState<AudienceInsights | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    fetch('/api/promoter/insights').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData).catch((e) => { console.error('[audience insights]', e); setError(true) })
  }, [])

  const hiddenNote = `Hidden: fewer than ${MIN_GROUP} people.`
  return (
    <section className="rounded-xl bg-card border border-border p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" />Who's into your events</h2>
        {data?.enough && <span className="text-xs text-muted-foreground">About {data.audienceApprox}+ interested people</span>}
      </div>
      <p className="text-xs text-muted-foreground mb-4 flex gap-1.5"><ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />{AUDIENCE_DISCLAIMER}</p>
      {!data && !error && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Crunching the crowd…</p>}
      {error && <p className="text-sm text-muted-foreground">Audience insights are having a lie-down. Try again soon.</p>}
      {data && (
        <div className="space-y-4">
          {!data.enough && (
            <p className="text-sm rounded-lg bg-muted/60 px-4 py-3">The crowd's still gathering! Once {MIN_GROUP}+ signed-in people engage with your events, age bands, home areas and more show up here.</p>
          )}
          {data.enough && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Bars title="Age bands" Icon={Users} items={data.ageBands} empty={hiddenNote} />
              <Bars title="Home areas" Icon={MapPin} items={data.areas} empty={hiddenNote} />
              <Bars title="Also into" Icon={Heart} items={data.interests} empty={hiddenNote} />
              <Bars title="How far ahead they plan" Icon={CalendarClock} items={data.planAhead} empty={hiddenNote} />
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-4">
            <Top title="Most saved" Icon={Bookmark} items={data.topSaved} unit="saves" />
            <Top title="Most shared" Icon={Share2} items={data.topShared} unit="shares" />
            <Top title="Most added to itineraries" Icon={Route} items={data.topItinerary} unit="adds" />
          </div>
          {data.enough && data.hidden > 0 && <p className="text-[11px] text-muted-foreground">{data.hidden} small group{data.hidden === 1 ? '' : 's'} hidden to protect privacy.</p>}
        </div>
      )}
    </section>
  )
}
