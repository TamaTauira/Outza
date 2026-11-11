import { VibePeepMascot } from '@/components/vibepeep-mascot'

/** Compact dark intro shared by Saved and Itinerary. Heading and line on the left, mascot top-aligned on the right. */
export function PageMasthead({ title, lede }: { title: string; lede: string }) {
  return (
    <section className="overflow-hidden rounded-3xl bg-[#0c0f0e] px-4 py-6 text-white sm:px-8 sm:py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-3 max-w-xl text-sm text-white/80 sm:text-lg">{lede}</p>
        </div>
        <VibePeepMascot onDark className="w-16 shrink-0 sm:w-24" sizes="96px" alt="VibePeep" />
      </div>
    </section>
  )
}
