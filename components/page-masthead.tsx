import type { ReactNode } from 'react'
import { HeroCard, ITINERARY_HERO_SRC, SAVED_HERO_SRC } from '@/components/hero-card'

/** Saved and Itinerary use the same header card as Home and Local. */
const MASTHEADS = {
  itinerary: {
    title: 'Make a day of it.',
    lede: 'Line up the good stuff. The gig, the dinner, the drinks and everything in between.',
    image: ITINERARY_HERO_SRC,
  },
  saved: {
    title: 'The keepers.',
    lede: 'Your little collection of good times. All the things you’ve spotted, loved and don’t want to forget.',
    image: SAVED_HERO_SRC,
  },
} as const

export function PageMasthead({ variant, children }: { variant: keyof typeof MASTHEADS; children?: ReactNode }) {
  const current = MASTHEADS[variant]
  return (
    <HeroCard
      image={current.image}
      title={<span className="vp-gradient-line text-brand-gradient">{current.title}</span>}
      lede={current.lede}
    >
      {children}
    </HeroCard>
  )
}
