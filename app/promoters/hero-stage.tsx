const ROWS = [
  { name: 'Headliner', note: 'Top of the Featured row' },
  { name: 'Spotlight', note: 'Above Boost' },
  { name: 'Boost', note: 'Featured row in the event’s city' },
] as const

/** Where the three packages sit. Not a sample event and not a measured result. */
export function HeroStage() {
  return (
    <figure className="rounded-[1.75rem] border border-white/10 bg-[#1c1c22] p-4 text-white shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
      <figcaption className="text-sm font-semibold">Featured row</figcaption>
      <p className="mt-1 text-xs text-white/70">Each paid place is labelled Sponsored. Organic events stay in the row.</p>
      <ol className="mt-4 space-y-2">
        {ROWS.map((row) => (
          <li key={row.name} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-3">
            <span>
              <span className="block font-semibold">{row.name}</span>
              <span className="block text-xs text-white/70">{row.note}</span>
            </span>
            <span className="rounded bg-black px-1.5 py-0.5 text-xs font-bold">SPONSORED</span>
          </li>
        ))}
      </ol>
    </figure>
  )
}
