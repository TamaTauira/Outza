import { Check, Clock } from 'lucide-react'

// Fictional demonstration data — only used to show the dashboard layout. Never real metrics.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const VIEWS = [880, 1150, 1400, 1950, 2500, 2850, 1750]
const TOTAL = VIEWS.reduce((s, v) => s + v, 0)
const CLICKS = 842

const CAPABILITIES: [string, boolean][] = [
  ['Event creation', true],
  ['Claiming existing listings', true],
  ['Billing & payment history', true],
  ['Campaign upgrades & renewal', true],
  ['Ticket-click reporting', true],
  ['Listing edits', true],
  ['Referral traffic', true],
  ['Invoice downloads', true],
  ['Emailed performance reports', true],
]

function Chart() {
  const W = 600, H = 220, P = { l: 44, r: 12, t: 12, b: 28 }
  const min = 650, max = 3200
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / (VIEWS.length - 1)
  const y = (v: number) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b)
  const ticks = [650, 1300, 2000, 2600, 3200]
  const path = VIEWS.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Illustrative line chart of event views from Monday to Sunday, peaking on Saturday">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray="3 4" />
          <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{t >= 1000 ? `${(t / 1000).toFixed(1).replace('.0', '')}K` : t}</text>
        </g>
      ))}
      <path d={path} fill="none" className="stroke-primary" strokeWidth={2.5} strokeLinejoin="round" />
      {VIEWS.map((v, i) => <circle key={DAYS[i]} cx={x(i)} cy={y(v)} r={4} className="fill-primary" />)}
      {DAYS.map((d, i) => <text key={d} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">{d}</text>)}
    </svg>
  )
}

export function DashboardPreview() {
  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-start">
      <div className="rounded-2xl bg-card border border-border p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Outza for Business</p>
            <p className="mt-1 font-display text-xl font-bold">Your event performance</p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">Illustrative</span>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4">
          {[['Views', TOTAL.toLocaleString('en-AU')], ['Clicks', CLICKS.toLocaleString('en-AU')], ['CTR', `${((CLICKS / TOTAL) * 100).toFixed(1)}%`]].map(([l, v]) => (
            <div key={l}><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold tabular-nums">{v}</p></div>
          ))}
        </div>
        <p className="mt-6 text-sm font-medium">Event views over time</p>
        <div className="mt-2"><Chart /></div>
        <p className="text-xs text-muted-foreground">Fictional demonstration data</p>
        <div className="mt-5 pt-5 border-t border-border flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold">Spotlight campaign</p>
            <p className="text-sm text-muted-foreground">Performance and campaign management</p>
          </div>
          <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 text-xs font-semibold">Active</span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Concept only. These figures are made up to demonstrate the dashboard layout.</p>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">Your organiser portal is where you claim listings, manage events, buy promotion packages and see how they perform. If you spend $49 on a campaign, you should be able to see the visibility and engagement it generated.</p>
        <ul className="mt-5 space-y-2.5">
          {CAPABILITIES.map(([label, live]) => (
            <li key={label} className="flex items-center justify-between gap-3 rounded-lg bg-card border border-border px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2">{live ? <Check className="w-4 h-4 text-primary" /> : <Clock className="w-4 h-4 text-muted-foreground" />}{label}</span>
              <span className={live ? 'text-xs font-semibold text-primary' : 'text-xs text-muted-foreground'}>{live ? 'Available now' : 'Coming soon'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
