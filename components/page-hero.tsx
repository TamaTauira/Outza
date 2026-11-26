import type { ReactNode } from 'react'
import { HeroCard, ITINERARY_HERO_SRC, SAVED_HERO_SRC } from '@/components/hero-card'

/**
 * Picture, gradient title and one lede. Plan and Saved both use this, so the
 * padding, title size and lede size cannot drift. Home and Local keep HeroCard
 * because their heroes also carry search.
 */
const PAGES = {
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

export type PageHeroVariant = keyof typeof PAGES

export function PageHero({ variant, children }: { variant: PageHeroVariant; children?: ReactNode }) {
  const current = PAGES[variant]
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
