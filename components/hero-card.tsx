import Image from 'next/image'
import type { ReactNode } from 'react'

/** City heroes keep the picked file names so a later swap is a file replace. */
const CITY_HERO: Record<string, string> = {
  sydney: '/heroes/sydney-option-1-hq.webp',
  melbourne: '/heroes/melbourne-option-2-hq.webp',
  perth: '/heroes/perth-option-2-hq.webp',
  brisbane: '/heroes/brisbane-option-2-hq.webp',
  adelaide: '/heroes/adelaide-option-2-hq.webp',
  'gold coast': '/heroes/gold-coast-option-2-hq.webp',
  canberra: '/heroes/canberra-option-2-hq.webp',
  newcastle: '/heroes/newcastle-option-2-hq.webp',
  hobart: '/heroes/hobart-option-2-hq.webp',
  darwin: '/heroes/darwin-option-2-hq.webp',
}

export function cityHeroSrc(city: string | null | undefined): string {
  const key = (city ?? 'sydney').trim().toLowerCase()
  return CITY_HERO[key] ?? CITY_HERO.sydney
}

export const SAVED_HERO_SRC = '/heroes/saved-option-2-hq.webp'
export const ITINERARY_HERO_SRC = '/heroes/itinerary-bike-1-hq.webp'

/**
 * Shared header card for Home, Local, Saved and Itinerary.
 * Same radius, same inner padding, gradient headline, image anchored right
 * so Tummer stays in frame when the card is narrow.
 */
export function HeroCard({
  image,
  title,
  lede,
  children,
  priority = false,
}: {
  image: string
  title: ReactNode
  lede?: ReactNode
  children?: ReactNode
  priority?: boolean
}) {
  return (
    <header className="vp-hero-card relative overflow-hidden rounded-3xl bg-[#0c0f0e] text-white shadow-[var(--vp-shadow-lg)]">
      <Image
        src={image}
        alt=""
        fill
        priority={priority}
        sizes="(max-width: 640px) 100vw, (max-width: 1080px) 100vw, (max-width: 1600px) 90vw, 1600px"
        className="object-cover object-right"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black via-black/78 to-black/20" />
      <div className="relative px-5 py-6 sm:px-8 sm:py-8">
        <h1 className="vp-hero-title max-w-[18ch] font-display font-extrabold tracking-tight">{title}</h1>
        {lede ? <div className="mt-3 max-w-xl text-sm leading-relaxed text-white/80 sm:text-lg">{lede}</div> : null}
        {children}
      </div>
    </header>
  )
}
