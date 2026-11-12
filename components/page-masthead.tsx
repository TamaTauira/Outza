/** Dark intro shared by Saved and Itinerary. Both copies are measured so the cards stay the same size. */
const MASTHEADS = {
  itinerary: {
    title: 'Make a day of it.',
    lede: 'Line up the good stuff. The gig, the dinner, the drinks and everything in between.',
  },
  saved: {
    title: 'The keepers.',
    lede: 'Your little collection of good times. All the things you’ve spotted, loved and don’t want to forget.',
  },
} as const

const titleClass = 'font-display text-4xl font-bold tracking-tight sm:text-5xl'
const ledeClass = 'mt-3 text-sm text-white/80 sm:text-lg'

export function PageMasthead({ variant }: { variant: keyof typeof MASTHEADS }) {
  const current = MASTHEADS[variant]
  return (
    <section className="grid w-full overflow-hidden rounded-3xl bg-[#0c0f0e] px-4 py-6 text-white sm:px-8 sm:py-8">
      {Object.entries(MASTHEADS).map(([id, item]) => (
        <div key={id} className="invisible col-start-1 row-start-1 select-none" aria-hidden="true">
          <p className={titleClass}>{item.title}</p>
          <p className={ledeClass}>{item.lede}</p>
        </div>
      ))}
      <div className="col-start-1 row-start-1">
        <h1 className={titleClass}>{current.title}</h1>
        <p className={ledeClass}>{current.lede}</p>
      </div>
    </section>
  )
}
