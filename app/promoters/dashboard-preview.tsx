import { Check } from 'lucide-react'

const PLACEMENTS = [
  { name: 'Boost', where: 'Featured row in your event’s city, labelled Sponsored.' },
  { name: 'Spotlight', where: 'Same Featured row, above Boost.' },
  { name: 'Headliner', where: 'Top of that Featured row for the city.' },
] as const

const BENEFITS = [
  'See views, saves and ticket clicks on a free account',
  'See where people found the listing',
  'A weekly recap when you ask for one',
  'CSV export of your events',
  'Tracked links for the places you share',
  'Tips written from the numbers on the listing',
] as const

/** Where each package sits. No sample numbers. */
export function DashboardPreview() {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <div className="min-w-0 rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h3 className="font-display text-xl font-bold">Where a package appears</h3>
        <ol className="mt-4 space-y-3">
          {PLACEMENTS.map((item, index) => (
            <li key={item.name} className="rounded-2xl border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Featured row · {index + 1}</p>
              <p className="mt-1 font-semibold">{item.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.where}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted-foreground">An evening pass and a day pass sit in Hot right now for that city, still labelled Sponsored. They do not replace the row above.</p>
      </div>
      <div className="min-w-0">
        <h3 className="font-display text-xl font-bold">What you can do</h3>
        <ul className="mt-4 space-y-2">
          {BENEFITS.map((line) => (
            <li key={line} className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vp-brand-orange-ink)]" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
