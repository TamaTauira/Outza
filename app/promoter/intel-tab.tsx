'use client'

import { useEffect, useState } from 'react'
import { Brain, Building2, ChevronDown, Info, Lightbulb, Loader2, MapPin, Plane, ShieldCheck, ShoppingBag, TrainFront, Users } from 'lucide-react'
import type { Insight, VenueIntel } from '@/lib/intel/analytics'
import { CONFIDENCE_LABEL, INSIGHT_SOURCE_LABEL } from '@/lib/intel/sources'
import { intelOwnerVoice } from '@/lib/intel/voice'
import { cn } from '@/lib/utils'

type Ev = { id: string; title: string; date: string; venueName: string; source?: string | null }
const card = 'rounded-xl bg-card border border-border p-5 shadow-sm'
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const period = (p?: string | null) => { if (!p) return ''; const m = p.match(/^(YE-)?(\d{4})-(\d{2})$/); return m ? `${m[1] ? 'YE ' : ''}${MON[Number(m[3]) - 1]} ${m[2]}` : p }
const num = (v: number | null | undefined, d = 0) => (v == null ? '—' : v.toLocaleString('en-AU', { minimumFractionDigits: d, maximumFractionDigits: d }))
const unitFmt = (v: number | null, unit: string, d: number) => (v == null ? '—' : unit === '%' ? `${num(v, d)}%` : unit.startsWith('$') ? `$${num(v, d)}` : num(v, d))
const signed = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`)
const big = (v: number | null, money = false) => (v == null ? '—' : `${money ? '$' : ''}${v >= 1e9 ? `${(v / 1e9).toFixed(1)}b` : `${(v / 1e6).toFixed(1)}m`}`)
const KIND: Record<string, string> = { observed: 'Published figure', derived: 'Worked out from published figures', modelled: 'Modelled', hypothesis: 'Idea to test' }
const CONF_STYLE: Record<string, string> = { high: 'bg-primary/15 text-primary', medium: 'bg-muted text-foreground', low: 'bg-muted text-muted-foreground', insufficient: 'bg-muted text-muted-foreground' }

function Section({ title, Icon, sub, children }: { title: string; Icon: typeof Brain; sub?: string; children: React.ReactNode }) {
  return (
    <section className={card}>
      <h3 className="font-semibold flex items-center gap-2"><Icon className="w-4 h-4 text-primary" />{title}</h3>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function InsightCard({ i }: { i: Insight }) {
  return (
    <li className={cn('rounded-lg bg-background border border-border p-4', i.highlight && 'md:col-span-2 border-primary/40 bg-primary/5')}>
      {i.highlight && <p className="text-[11px] font-semibold uppercase tracking-wide text-primary mb-1">LGBTIQ+</p>}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-sm">{i.title}</p>
        <span className={cn('text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0', CONF_STYLE[i.confidence])}>Confidence: {CONFIDENCE_LABEL[i.confidence]}</span>
      </div>
      <p className="text-sm text-muted-foreground mt-1.5">{i.detail}</p>
      {!!i.links?.length && (
        <ul className="mt-3 space-y-2">
          {i.links.map((l) => (
            <li key={l.url} className="text-sm">
              <a href={l.url} className="font-medium text-primary hover:underline" {...(l.url.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{l.name}</a>
              <span className="text-muted-foreground"> — {l.note}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground mt-2">{KIND[i.kind]} · {i.sources.map((s) => INSIGHT_SOURCE_LABEL[s] ?? s).join(', ')}</p>
    </li>
  )
}

export function IntelTab({ events }: { events: Ev[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? '')
  const [data, setData] = useState<VenueIntel | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (!eventId && events[0]) setEventId(events[0].id) }, [events, eventId])
  useEffect(() => {
    if (!eventId) return
    setLoading(true); setError(''); setData(null)
    fetch(`/api/promoter/intel?eventId=${encodeURIComponent(eventId)}`)
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`); return d })
      .then(setData)
      .catch((e) => { console.error('[intel]', e); setError(e instanceof Error ? e.message : 'Could not load the report') })
      .finally(() => setLoading(false))
  }, [eventId])

  if (!events.length) {
    return (
      <div className={cn(card, 'text-center py-12')}>
        <Brain className="w-8 h-8 text-primary mx-auto" />
        <p className="font-semibold mt-3">No events, no intel (yet)</p>
        <p className="text-sm text-muted-foreground mt-1">Claim or list an event and we&apos;ll size up who lives near the venue, what else is on that night, and where the ad should go.</p>
      </div>
    )
  }

  const g = data?.geo
  const owned = data ? data.voice.owned : intelOwnerVoice(events.find((e) => e.id === eventId)?.source)
  const venueWord = owned ? 'your venue' : 'the venue'
  return (
    <div className="space-y-6">
      <div className={card}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold flex items-center gap-2"><Brain className="w-5 h-5 text-primary" />VibePeep Intelligence</h2>
            <p className="text-sm text-muted-foreground mt-1">Know the patch around {venueWord} before the push. Who is nearby, where to advertise, and whether this night is crowded — with the fine print left in.</p>
          </div>
          <label className="text-sm w-full sm:w-80">
            <span className="text-xs text-muted-foreground">Event</span>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="mt-1 h-10 rounded-md border border-border bg-background px-3 text-sm w-full">
              {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground mt-4 flex gap-1.5"><ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />Area figures describe people who live there. Spending and tourism are statewide. Catalogue counts are VibePeep listings. None of it is ticket sales, foot traffic or attendance, and nothing is estimated.</p>
      </div>

      {loading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Reading the neighbourhood… (first look at a venue can take ~20 seconds)</p>}
      {error && <p className="text-sm rounded-lg bg-muted/60 px-4 py-3">{error}</p>}

      {data && (
        <>
          <p className="text-sm text-muted-foreground">{[data.event.dateLabel, data.event.category, data.event.queer ? 'LGBTIQ+' : ''].filter(Boolean).join(' · ')}</p>
          {g && <p className="text-sm flex flex-wrap items-center gap-x-2 gap-y-1"><MapPin className="w-4 h-4 text-primary" /><b>{data.event.venueName}</b><span className="text-muted-foreground">· {[g.salName && `Suburb: ${g.salName}`, g.sa2Name && `Venue area: ${g.sa2Name}`, g.lgaName && `Council: ${g.lgaName}`, g.poa && `Postcode ${g.poa}`].filter(Boolean).join(' · ')}</span></p>}
          {data.message && <p className="text-sm rounded-lg bg-muted/60 px-4 py-3 flex gap-2"><Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />{data.message}</p>}

          {data.insights.length > 0 && (
            <Section title="What to do with this event" Icon={Lightbulb} sub="Tied to this listing: suburb, category, night and price. Catalogue counts are VibePeep listings, not sales or foot traffic.">
              <ul className="grid md:grid-cols-2 gap-3">{data.insights.map((i) => <InsightCard key={i.title} i={i} />)}</ul>
            </Section>
          )}

          {(data.gaps?.length ?? 0) > 0 && (
            <Section title="Not in this report" Icon={Info} sub="These would help the promo plan. They are not imported, so there is no number here.">
              <ul className="space-y-3">
                {data.gaps.map((gap) => (
                  <li key={gap.title} className="text-sm">
                    <p className="font-semibold">{gap.title}</p>
                    <p className="text-muted-foreground mt-0.5">{gap.detail}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {data.area.length > 0 && (
            <Section title={`Who lives around ${data.voice?.venue ?? venueWord}`} Icon={Building2} sub="ABS Data by Region. Venue area = ABS SA2 containing the venue. Census figures are from 2021.">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead><tr className="text-xs text-muted-foreground text-left"><th className="py-2 pr-3 font-medium">Measure</th><th className="py-2 px-3 font-medium text-right">Venue area</th><th className="py-2 px-3 font-medium text-right">Council</th><th className="py-2 px-3 font-medium text-right">{data.benchLabel}</th><th className="py-2 pl-3 font-medium text-right">Year</th></tr></thead>
                  <tbody>
                    {data.area.map((a) => (
                      <tr key={a.code} className="border-t border-border">
                        <td className="py-2 pr-3" title={[a.meaning, a.limitation].filter(Boolean).join(' ')}>{a.label}<span className="block text-[11px] text-muted-foreground">{a.unit}</span></td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold">{unitFmt(a.venue, a.unit, a.decimals)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{unitFmt(a.council, a.unit, a.decimals)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{unitFmt(a.bench, a.unit, a.decimals)}</td>
                        <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">{a.venuePeriod ?? a.benchPeriod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            {data.ages.length > 0 && (
              <Section title="Age mix of residents" Icon={Users} sub={`Share of residents, venue area vs ${data.benchLabel} (ABS, ${data.agePeriod}).`}>
                <ul className="space-y-3">
                  {data.ages.map((a) => (
                    <li key={a.band} className="text-xs">
                      <div className="flex justify-between"><span>{a.band}</span><span className="tabular-nums"><b>{a.venue.toFixed(1)}%</b><span className="text-muted-foreground"> vs {a.bench == null ? '—' : `${a.bench.toFixed(1)}%`}</span></span></div>
                      <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, a.venue * 2.5)}%` }} /></div>
                      {a.bench != null && <div className="h-1 rounded-full bg-muted mt-0.5 overflow-hidden"><div className="h-full rounded-full bg-foreground/40" style={{ width: `${Math.min(100, a.bench * 2.5)}%` }} /></div>}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground mt-3">Thick bar: venue area. Thin bar: {data.benchLabel}.</p>
              </Section>
            )}
            {data.seifa.length > 0 && (
              <Section title="Area socio-economic ranking" Icon={MapPin} sub={`ABS SEIFA 2021 for ${data.seifa[0].area}. Deciles 1–10 rank the area, never a person.`}>
                <ul className="space-y-3">
                  {data.seifa.map((s) => (
                    <li key={s.index} className="text-sm">
                      <div className="flex justify-between gap-3"><span>{s.label}</span><span className="tabular-nums font-semibold shrink-0">{data.stateName} decile {s.nswDecile ?? '—'}</span></div>
                      <p className="text-[11px] text-muted-foreground">{s.meaning}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>

          {data.status !== 'no_location' && data.status !== 'outside_au' && (
            <Section title="Getting there" Icon={TrainFront} sub={data.transportCovered ? 'Transport for NSW stations, wharves and stops within 2 km (straight line). Tap-ons are monthly Opal totals, not attendance.' : 'Opal tap-on counts are published for New South Wales only.'}>
              {!data.transportCovered ? <p className="text-sm text-muted-foreground">This city is outside the Transport for NSW dataset, so station patronage is not shown. We don&apos;t substitute another city&apos;s taps.</p> : data.stations.length ? (
                <ul className="divide-y divide-border">
                  {data.stations.map((s) => (
                    <li key={s.name} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span><b>{s.name}</b> <span className="text-muted-foreground">· {s.modes} · {s.distanceKm < 1 ? `${Math.round(s.distanceKm * 1000)} m` : `${s.distanceKm.toFixed(1)} km`}{s.accessible ? ' · accessible' : ''}</span></span>
                      <span className="text-xs tabular-nums text-muted-foreground">{s.entries != null ? <><b className="text-foreground">{num(s.entries)}</b> tap-ons in {period(s.month)} · {signed(s.yoyPct)} vs last year</> : 'No tap-on data published for this stop'}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">No train, metro, light rail or ferry stop within 2 km. Bus stops aren&apos;t in this dataset yet.</p>}
            </Section>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            {data.spending.length > 0 && (
              <Section title={`${data.spendLabel} household spending`} Icon={ShoppingBag} sub={`ABS Monthly Household Spending Indicator, ${period(data.spending[0].month)}. Statewide, current prices.`}>
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-muted-foreground text-left"><th className="py-1.5 font-medium">Category</th><th className="py-1.5 font-medium text-right">$m</th><th className="py-1.5 font-medium text-right">vs last year</th></tr></thead>
                  <tbody>{data.spending.map((s) => <tr key={s.category} className="border-t border-border"><td className="py-2">{s.label}</td><td className="py-2 text-right tabular-nums">{num(s.valueM)}</td><td className="py-2 text-right tabular-nums font-semibold">{signed(s.yoyPct)}</td></tr>)}</tbody>
                </table>
              </Section>
            )}
            {data.tourism.period && (
              <Section title={data.tourismTitle ?? 'Visitors'} Icon={Plane} sub={`Destination NSW, ${period(data.tourism.period)}. Survey estimates for that region, not this venue.`}>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-xs text-muted-foreground">All visitors</dt><dd className="text-xl font-bold tabular-nums">{big(data.tourism.visitors)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Visitor nights</dt><dd className="text-xl font-bold tabular-nums">{big(data.tourism.nights)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Visitor spend</dt><dd className="text-xl font-bold tabular-nums">{big(data.tourism.spend, true)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">International visitors</dt><dd className="text-xl font-bold tabular-nums">{big(data.tourism.intlVisitors)}<span className="text-xs font-medium text-muted-foreground ml-1">{data.tourism.intlYoyPct != null && `${signed(data.tourism.intlYoyPct)} on ${period(data.tourism.intlPrevPeriod)}`}</span></dd></div>
                </dl>
              </Section>
            )}
          </div>

          <details className={cn(card, 'group')}>
            <summary className="cursor-pointer list-none font-semibold flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Info className="w-4 h-4 text-primary" />Sources, freshness & limitations</span><ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" /></summary>
            <ul className="mt-4 space-y-3">
              {data.sources.map((s) => (
                <li key={s.key} className="text-xs">
                  <p className="text-sm font-medium"><a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary">{s.name}</a> <span className="text-muted-foreground font-normal">· {s.key === 'google_bp' ? 'Not connected' : s.lastSuccessAt ? `Updated ${new Date(s.lastSuccessAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' })}${s.latestPeriod ? ` · latest data ${period(s.latestPeriod)}` : ''}` : 'Not imported yet'}</span></p>
                  <p className="text-muted-foreground mt-0.5">{s.limitations}</p>
                  <p className="text-muted-foreground mt-0.5">{s.attribution} Licence: {s.licence}.</p>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  )
}
