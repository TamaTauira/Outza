'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatAudCents } from '@/lib/tiers'
import { formatHour, returnEstimate } from '@/lib/organiser-reach'
import type { ReachPayload } from '@/lib/organiser-reach-load'

const card = 'rounded-xl border border-border bg-card p-4 shadow-sm'
const num = (value: number | null) => value == null ? 'Locked' : value.toLocaleString('en-AU')

function Trend({ series, showPrivate }: { series: ReachPayload['series']; showPrivate: boolean }) {
  const width = 640
  const height = 168
  const max = Math.max(1, ...series.flatMap((point) => [point.saves, showPrivate ? point.opened : 0, showPrivate ? point.ticket : 0, showPrivate ? point.seen : 0]))
  const x = (index: number) => (series.length <= 1 ? width / 2 : (index / (series.length - 1)) * width)
  const y = (value: number) => height - 16 - (value / max) * (height - 28)
  const path = (pick: (point: ReachPayload['series'][number]) => number) => series.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(pick(point)).toFixed(1)}`).join(' ')
  const last = series[series.length - 1]
  const first = series[0]
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Daily trend from ${first?.day ?? ''} to ${last?.day ?? ''}`} className="w-full min-w-[280px] h-44">
        <path d={path((point) => point.saves)} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary" />
        {showPrivate && <path d={path((point) => point.opened)} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-foreground/70" />}
        {showPrivate && <path d={path((point) => point.ticket)} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600" />}
        {showPrivate && <path d={path((point) => point.seen)} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="text-muted-foreground" />}
      </svg>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {showPrivate && <span>Dashed · seen</span>}
        {showPrivate && <span>Grey · opened</span>}
        <span className="text-primary">Colour · saved</span>
        {showPrivate && <span className="text-emerald-700">Green · Get tickets</span>}
        <span>{first?.day} → {last?.day}</span>
      </div>
    </div>
  )
}

export function ReachDashboard({
  payload,
  csvHref,
  onCreateLink,
}: {
  payload: ReachPayload
  csvHref: string
  onCreateLink?: (input: { eventId: string; label: string; channel: string }) => Promise<void>
}) {
  const [price, setPrice] = useState('')
  const dollars = Number(price)
  const priceOk = price.trim() !== '' && Number.isFinite(dollars) && dollars > 0
  const hourMax = useMemo(() => Math.max(1, ...payload.hours.map((row) => row.count)), [payload.hours])
  const totals = payload.totals

  return (
    <div className="space-y-4">
      {payload.lockNote && <p className="rounded-lg bg-muted/70 px-4 py-3 text-sm">{payload.lockNote}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Seen', totals.seen],
          ['Opened', totals.opened],
          ['Saved', totals.saves],
          ['Get tickets', totals.ticket],
          ['More info', totals.info],
          ['Reactions', totals.reactions],
          ['Going', totals.going],
          ['Shares', totals.shares],
        ].map(([label, value]) => (
          <div key={String(label)} className={card}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{num(value as number | null)}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">All-time page views {num(payload.allTime.views)} · all-time Get tickets {num(payload.allTime.ticketClicks)} · saves on the listing {payload.allTime.saves.toLocaleString('en-AU')} · shares {payload.allTime.shares.toLocaleString('en-AU')} · itinerary adds {payload.allTime.itinerary.toLocaleString('en-AU')}. Plan adds in this range {totals.plans.toLocaleString('en-AU')} · calendar exports {num(totals.calendar)}.</p>

      <section className={card}>
        <h2 className="font-semibold">How the days went</h2>
        <p className="mt-1 text-xs text-muted-foreground">One point per day in the range you picked.</p>
        {payload.series.length ? <div className="mt-3"><Trend series={payload.series} showPrivate={payload.showPrivate} /></div> : <p className="mt-3 text-sm text-muted-foreground">No days in this range yet.</p>}
      </section>

      <section className={card}>
        <h2 className="font-semibold">Where interest drops off</h2>
        <p className="mt-1 text-xs text-muted-foreground">Seen, then opened, then saved, then a Get tickets tap. Saves can happen from the board before anyone opens the page.</p>
        <ol className="mt-4 space-y-3">
          {payload.funnel.map((stage) => {
            const width = stage.value == null ? 8 : Math.max(8, stage.share ?? 0)
            return (
              <li key={stage.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{stage.label}</span>
                  <span className="tabular-nums">{stage.value == null ? 'Locked' : stage.value.toLocaleString('en-AU')}{stage.share != null ? ` · ${stage.share}% of the first step` : ''}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} /></div>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">Reactions</h2>
          {payload.reactions.length ? (
            <ul className="mt-3 space-y-2">
              {payload.reactions.map((row) => (
                <li key={row.kind} className="flex items-center justify-between text-sm"><span>{row.label}</span><span className="font-semibold tabular-nums">{row.count.toLocaleString('en-AU')}</span></li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted-foreground">No Hot, Love it, Interested or Excited taps in this range. The buttons are on the listing when someone is signed in.</p>}
        </section>
        <section className={card}>
          <h2 className="font-semibold">Where they saw it</h2>
          {payload.surfaces.length ? (
            <ul className="mt-3 space-y-2">
              {payload.surfaces.map((row) => (
                <li key={row.label} className="flex items-center justify-between text-sm"><span>{row.label}</span><span className="font-semibold tabular-nums">{row.count.toLocaleString('en-AU')}</span></li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted-foreground">Appearances on the board, map, search, Hot right now and Local start from this launch. Nothing has been counted in this range yet.</p>}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">Who’s in the room</h2>
          <p className="mt-1 text-xs text-muted-foreground">Categories they follow, and music styles showing up in their saves. Groups under 10 stay hidden. No names, emails or postcodes.</p>
          {payload.audience.length ? (
            <ul className="mt-3 space-y-2">{payload.audience.map((row) => <li key={row.label} className="text-sm flex justify-between"><span>{row.label}</span><span className="tabular-nums font-semibold">{row.pct}%</span></li>)}</ul>
          ) : <p className="mt-3 text-sm text-muted-foreground">The crowd’s still gathering. This shows up once 10 or more signed-in adults have engaged.</p>}
          {payload.styles.length > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Music styles in their saves</p>
              <ul className="mt-2 space-y-2">{payload.styles.map((row) => <li key={row.label} className="text-sm flex justify-between"><span>{row.label}</span><span className="tabular-nums font-semibold">{row.pct}%</span></li>)}</ul>
            </>
          )}
          {payload.peakLine && <p className="mt-4 text-sm">{payload.peakLine}</p>}
          {payload.hours.length > 0 && (
            <div className="mt-3 flex h-16 items-end gap-1" aria-hidden>
              {payload.hours.map((row) => <div key={row.hour} title={formatHour(row.hour)} className="flex-1 rounded-sm bg-primary/80" style={{ height: `${Math.max(8, (row.count / hourMax) * 100)}%` }} />)}
            </div>
          )}
        </section>
        <section className={card}>
          <h2 className="font-semibold">Viewer areas</h2>
          <p className="mt-1 text-xs text-muted-foreground">City, or a broad home area when they’re signed in. Under 10 people from one place, it stays off this list.</p>
          {payload.places.length ? (
            <ul className="mt-3 space-y-2">{payload.places.map((row) => <li key={row.label} className="text-sm flex justify-between"><span>{row.label}</span><span className="tabular-nums font-semibold">{row.count.toLocaleString('en-AU')}</span></li>)}</ul>
          ) : <p className="mt-3 text-sm text-muted-foreground">No area has reached 10 people in this range yet. That’s the privacy floor, not a quiet night.</p>}
          {payload.terms.length > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Search terms that led here</p>
              <ul className="mt-2 space-y-1">{payload.terms.map((row) => <li key={row.term} className="text-sm flex justify-between"><span>{row.term}</span><span className="tabular-nums">{row.count}</span></li>)}</ul>
            </>
          )}
        </section>
      </div>

      <section className={card}>
        <h2 className="font-semibold">Against your other listings</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Event</th><th className="py-2 text-right font-medium">Seen</th><th className="py-2 text-right font-medium">Opened</th><th className="py-2 text-right font-medium">Saves</th><th className="py-2 text-right font-medium">Reactions</th><th className="py-2 text-right font-medium">Get tickets</th></tr></thead>
            <tbody>
              {payload.comparison.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="py-2 pr-3"><Link href={`/events/${row.id}`} className="font-medium hover:text-primary">{row.title}</Link></td>
                  <td className="py-2 text-right tabular-nums">{num(row.seen)}</td>
                  <td className="py-2 text-right tabular-nums">{num(row.opened)}</td>
                  <td className="py-2 text-right tabular-nums">{row.saves.toLocaleString('en-AU')}</td>
                  <td className="py-2 text-right tabular-nums">{row.reactions.toLocaleString('en-AU')}</td>
                  <td className="py-2 text-right tabular-nums">{num(row.ticket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!payload.comparison.length && <p className="text-sm text-muted-foreground">No listings in this view yet.</p>}
        </div>
      </section>

      {payload.includeSpend && (
        <section className={card}>
          <h2 className="font-semibold">Spotlight and other paid runs</h2>
          <p className="mt-1 text-xs text-muted-foreground">{payload.campaignNote}</p>
          {payload.campaigns.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Run</th><th className="py-2 text-right font-medium">Serves</th><th className="py-2 text-right font-medium">Clicks</th><th className="py-2 text-right font-medium">CTR</th><th className="py-2 text-right font-medium">Spend</th><th className="py-2 text-right font-medium">Cost / click</th></tr></thead>
                <tbody>
                  {payload.campaigns.map((row) => {
                    const earned = returnEstimate(row.ticketClicks, priceOk ? dollars : null)
                    return (
                      <tr key={row.id} className="border-t border-border align-top">
                        <td className="py-2 pr-3"><span className="font-medium">{row.name}</span><span className="block text-xs text-muted-foreground">{row.eventTitle}</span>{earned != null && <span className="mt-1 block text-xs">If every Get tickets click bought one ticket, that’s {formatAudCents(earned)}. A ceiling, not a receipt.</span>}</td>
                        <td className="py-2 text-right tabular-nums">{row.impressions.toLocaleString('en-AU')}</td>
                        <td className="py-2 text-right tabular-nums">{row.clicks.toLocaleString('en-AU')}</td>
                        <td className="py-2 text-right tabular-nums">{row.ctr == null ? '—' : `${row.ctr}%`}</td>
                        <td className="py-2 text-right tabular-nums">{row.spendCents == null ? '—' : formatAudCents(row.spendCents)}</td>
                        <td className="py-2 text-right tabular-nums">{row.cpcCents == null ? '—' : formatAudCents(row.cpcCents)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="mt-3 text-sm text-muted-foreground">No paid run in this view yet. A short boost or a Spotlight package will land here with serves, clicks and what you spent.</p>}
          <label className="mt-4 block text-sm">Ticket price, if you want a ceiling on what the clicks might have earned
            <input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value.replace(/[^0-9.]/g, '').slice(0, 8))} placeholder="25" aria-label="Ticket price in dollars" className="mt-1 h-10 w-full max-w-xs rounded-md border border-border bg-background px-3" />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">VibePeep never sees the sale. The figure only multiplies Get tickets clicks by the price you type.</p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">Competition radar</h2>
          <p className="mt-1 text-xs text-muted-foreground">{payload.radarNote}</p>
          {payload.radar.length ? (
            <ul className="mt-3 space-y-2">
              {payload.radar.map((row) => (
                <li key={row.href} className="text-sm">
                  <Link href={row.href} className="font-medium hover:text-primary">{row.title}</Link>
                  <span className="block text-xs text-muted-foreground">{row.when} · {row.where} · {row.category} · {row.attention}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted-foreground">No other public listings are crashing the same night in that patch. The lane looks clear.</p>}
          {payload.benchmark && <p className="mt-4 text-sm font-medium">{payload.benchmark}</p>}
        </section>
        <section className={card}>
          <h2 className="font-semibold">Worth a try</h2>
          <ul className="mt-3 space-y-2">{payload.tips.map((tip) => <li key={tip} className="text-sm">{tip}</li>)}</ul>
          <a href={csvHref} className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">Download CSV</a>
        </section>
      </div>

      {(payload.shareLinks.length > 0 || onCreateLink) && (
        <section className={card}>
          <h2 className="font-semibold">Tracked links</h2>
          <p className="mt-1 text-xs text-muted-foreground">Post these on Instagram, TikTok or wherever the crowd already is. Each visit is counted. No extra tracker.</p>
          {onCreateLink && <ShareForm events={payload.events} onCreate={onCreateLink} />}
          <ul className="mt-3 space-y-2">
            {payload.shareLinks.map((link) => (
              <li key={link.id} className="text-sm">
                <span className="font-medium">{link.label}</span>
                <span className="text-muted-foreground"> · {link.eventTitle} · {link.channel}</span>
                <span className="block break-all text-xs">{link.url}</span>
                <span className="text-xs text-muted-foreground">{link.visits == null ? 'Visits unlock with Promoter Pro or a promotion.' : `${link.visits.toLocaleString('en-AU')} visits`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-muted-foreground">{payload.historyNote}</p>
    </div>
  )
}

function ShareForm({ events, onCreate }: { events: { id: string; title: string }[]; onCreate: (input: { eventId: string; label: string; channel: string }) => Promise<void> }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? '')
  const [label, setLabel] = useState('Instagram bio')
  const [channel, setChannel] = useState('instagram')
  const [busy, setBusy] = useState(false)
  return (
    <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]" onSubmit={async (event) => {
      event.preventDefault()
      setBusy(true)
      try { await onCreate({ eventId, label, channel }) } finally { setBusy(false) }
    }}>
      <select value={eventId} onChange={(event) => setEventId(event.target.value)} aria-label="Event for the link" className="h-10 rounded-md border border-border bg-background px-3 text-sm">
        {events.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
      </select>
      <input value={label} onChange={(event) => setLabel(event.target.value)} aria-label="Link name" maxLength={40} className="h-10 rounded-md border border-border bg-background px-3 text-sm" />
      <select value={channel} onChange={(event) => setChannel(event.target.value)} aria-label="Where you’ll post it" className="h-10 rounded-md border border-border bg-background px-3 text-sm">
        <option value="instagram">Instagram</option>
        <option value="tiktok">TikTok</option>
        <option value="facebook">Facebook</option>
        <option value="stories">Stories</option>
        <option value="other">Somewhere else</option>
      </select>
      <button disabled={busy || !eventId} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? 'Making it…' : 'Make link'}</button>
    </form>
  )
}
