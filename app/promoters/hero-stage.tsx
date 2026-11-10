/** Fictional discovery UI. Nothing here is a live event or a measured result. */

const POSTERS = [
  { kicker: 'Boost', title: 'Neon Nights', meta: 'Fri · 10:00 pm', city: 'Sydney', tone: 'linear-gradient(160deg,#9A3412,#431407)' },
  { kicker: 'Spotlight', title: 'Lost in the Groove', meta: 'Sat · 8:00 pm', city: 'Sydney', tone: 'linear-gradient(160deg,#9F1239,#4C0519)' },
  { kicker: 'Headliner', title: 'Rhythm & Soul', meta: 'Sat · 9:00 pm', city: 'Sydney', tone: 'linear-gradient(120deg,#9A3412,#9F1239)' },
] as const

function Note({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="currentColor" d="M18 6v22.2a7 7 0 1 0 4 6.3V16l16-4v16.2a7 7 0 1 0 4 6.3V6L18 12V6z" />
    </svg>
  )
}

export function HeroStage() {
  return (
    <figure className="relative mx-auto w-full max-w-[34rem]">
      <Note className="absolute -left-1 top-6 hidden h-8 w-8 -rotate-12 text-[#FF8A1A] sm:block" />
      <Note className="absolute -right-1 top-16 hidden h-10 w-10 rotate-12 text-[#FF4E6A] lg:block" />
      <div className="rounded-[1.75rem] border border-white/10 bg-[#1c1c22] p-2.5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:p-3">
        <div className="rounded-[1.35rem] bg-[#0c0c0e] p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 text-[11px] text-white/75">
            <p className="font-semibold text-white">Featured</p>
            <p className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">Illustrative</p>
          </div>
          <ul className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-medium text-white/70" aria-hidden>
            {['Live music', 'This weekend', 'Free', 'Family'].map((chip, i) => (
              <li key={chip} className={`rounded-full px-2 py-1 ${i === 0 ? 'bg-white text-[#141418]' : 'bg-white/10'}`}>{chip}</li>
            ))}
          </ul>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {POSTERS.map((poster, i) => (
              <li key={poster.title} className={i === 2 ? 'col-span-2' : ''}>
                <div className="relative overflow-hidden rounded-xl p-3 text-white" style={{ background: poster.tone }}>
                  <span className="rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold tracking-wide">SPONSORED</span>
                  <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.16em]">{poster.kicker}</p>
                  <p className="font-display text-base font-bold leading-tight sm:text-lg">{poster.title}</p>
                  <p className="mt-1 text-[11px] text-white/85">{poster.meta} · {poster.city}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[11px] text-white/70">
        Illustrative preview. These events are made up, and the cards are labelled Sponsored the way a real placement is.
      </figcaption>
    </figure>
  )
}
