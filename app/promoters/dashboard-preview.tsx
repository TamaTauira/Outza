import { Check, Clock } from 'lucide-react'

// Fictional demonstration data — only used to show the dashboard layout. Never real metrics.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const VIEWS = [880, 1150, 1400, 1950, 2500, 2850, 1750]
const TOTAL = VIEWS.reduce((s, v) => s + v, 0)
const CLICKS = 842

/**
 * Statuses match the promoter dashboard on this branch.
 * "Available now" is something the code already records or sends.
 * "Coming soon" is described so the page stays honest until that read ships.
 */
const CAPABILITIES: { label: string; live: boolean; note?: string }[] = [
  { label: 'Event creation', live: true },
  { label: 'Claiming existing listings', live: true },
  { label: 'Billing & payment history', live: true },
  { label: 'Campaign upgrades & renewal', live: true },
  { label: 'Ticket-link reporting', live: true },
  { label: 'Listing edits', live: true },
  { label: 'Referral traffic', live: true },
  { label: 'Invoice downloads', live: true },
  { label: 'Emailed performance reports', live: true, note: 'Weekly, or when you ask' },
  { label: 'Views, saves, going and reaction totals', live: true },
  { label: 'CSV export of your events', live: true },
  { label: 'Short-boost impressions, detail views, ticket clicks and repeat interest', live: true },
  { label: 'Shares and itinerary adds in the weekly email', live: true },
  { label: 'Audience snapshot in the weekly email', live: true, note: 'Age bands, home areas, interests, how far ahead people plan' },
  { label: 'Reactions by type (Hot, Love it, Interested)', live: false },
  { label: 'Info clicks, separate from ticket clicks', live: false },
  { label: 'Where the event was seen, and the searches that led to it', live: false },
  { label: 'Spotlight impressions, clicks, CTR and cost per click', live: false },
  { label: 'Day-by-day charts', live: false },
  { label: 'Funnel', live: false },
  { label: 'Competition radar', live: false },
  { label: 'Benchmarks', live: false, note: 'We don’t invent a comparison figure' },
  { label: 'Spotlight return estimate', live: false },
  { label: 'Tracked share links', live: false },
  { label: 'Tips', live: false },
]

function Chart() {
  const W = 600, H = 220, P = { l: 44, r: 12, t: 12, b: 28 }
  const min = 650, max = 3200
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / (VIEWS.length - 1)
  const y = (v: number) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b)
  const ticks = [650, 1300, 2000, 2600, 3200]
  const path = VIEWS.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${path} L${x(VIEWS.length - 1).toFixed(1)},${H - P.b} L${x(0).toFixed(1)},${H - P.b} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Illustrative line chart of made-up event views from Monday to Sunday, peaking on Saturday">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" />
          <text x={P.l - 8} y={y(t) + 4} textAnchor="end" fill="rgba(255,255,255,0.65)" fontSize="11">{t >= 1000 ? `${(t / 1000).toFixed(1).replace('.0', '')}K` : t}</text>
        </g>
      ))}
      <path d={area} fill="rgba(255,138,26,0.16)" />
      <path d={path} fill="none" stroke="#FF8A1A" strokeWidth={2.5} strokeLinejoin="round" />
      {VIEWS.map((v, i) => <circle key={DAYS[i]} cx={x(i)} cy={y(v)} r={4} fill="#FF4E6A" />)}
      {DAYS.map((d, i) => <text key={d} x={x(i)} y={H - 8} textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="11">{d}</text>)}
    </svg>
  )
}

export function DashboardPreview() {
  const ctr = ((CLICKS / TOTAL) * 100).toFixed(1)
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <div className="min-w-0 rounded-[1.75rem] bg-[#141418] p-4 text-white shadow-[0_20px_50px_rgba(0,0,0,0.16)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">VibePeep for Business</p>
            <p className="mt-1 font-display text-xl font-bold">Your event performance</p>
          </div>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">Illustrative</span>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[['Views', TOTAL.toLocaleString('en-AU')], ['Ticket clicks', CLICKS.toLocaleString('en-AU')], ['CTR', `${ctr}%`]].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="text-[11px] text-white/65 sm:text-xs">{label}</p>
              <p className="truncate text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm font-medium">Event views over time</p>
        <div className="mt-2"><Chart /></div>
        <p className="text-xs text-white/70">Fictional demonstration data. These figures are made up to show the layout.</p>
        <div className="mt-5 flex items-start justify-between gap-4 border-t border-white/10 pt-5">
          <div>
            <p className="font-semibold">Spotlight campaign</p>
            <p className="text-sm text-white/70">A sample of how a live campaign could read</p>
          </div>
          <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">Sample</span>
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">Views and ticket clicks show for a promoted event, and for every event while Promoter Pro is active. Saves, going and reaction totals are on the dashboard either way. The chart above is not a live report.</p>
        <h3 className="mt-5 text-sm font-semibold">Available now</h3>
        <ul className="mt-2 space-y-2">
          {CAPABILITIES.filter((item) => item.live).map((item) => (
            <li key={item.label} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
              <span className="flex min-w-0 items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#9A3412]" aria-hidden />
                <span>{item.label}{item.note ? <span className="mt-0.5 block text-xs text-muted-foreground">{item.note}</span> : null}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-[#9A3412]">Available now</span>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 text-sm font-semibold">Described here, not in the dashboard yet</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {CAPABILITIES.filter((item) => !item.live).map((item) => (
            <li key={item.label} className="inline-flex max-w-full items-start gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{item.label}{item.note ? ` — ${item.note}` : ''} · Coming soon</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
