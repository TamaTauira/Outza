'use client'

import Link from 'next/link'
import { useMounted } from '@/components/client-only'
import { ACKNOWLEDGEMENT_OF_COUNTRY, CITIES } from '@/lib/cities'
import { cityPath, type TopicKey } from '@/lib/seo'
import { OutzaLogo } from '@/components/outza-logo'

/** Crawlable links to the evergreen guides, repeated for every city. [short label, full anchor title, topic] */
const POPULAR_GUIDES: [string, (c: string) => string, TopicKey][] = [
  ['Things to do', (c) => `Things to do in ${c}`, 'events'],
  ['Tonight', (c) => `Events tonight in ${c}`, 'tonight'],
  ['This weekend', (c) => `${c} this weekend`, 'this-weekend'],
  ['Free events', (c) => `Free events in ${c}`, 'free-events'],
  ['Live music', (c) => `Live music in ${c}`, 'live-music'],
  ['Family', (c) => `Family activities in ${c}`, 'family'],
  ['LGBTIQ+', (c) => `LGBTIQ+ events in ${c}`, 'lgbtiq'],
  ['Markets', (c) => `Markets in ${c}`, 'markets'],
  ['Community', (c) => `Community events in ${c}`, 'community-events'],
]

export interface QuickLink {
  label: string
  onClick: () => void
}

interface FooterProps {
  lastRefresh: string | null
  quickLinks?: QuickLink[]
}

export function Footer({ lastRefresh, quickLinks = [] }: FooterProps) {
  const mounted = useMounted()

  const refreshed = (() => {
    if (!lastRefresh || !mounted) return 'recently'
    return new Date(lastRefresh).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    })
  })()

  return (
    <footer className="mt-10">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10 grid gap-8 md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="flex flex-col gap-2">
          <OutzaLogo size="sm" />
          <span className="text-[11px] text-muted-foreground">Your city. Your events. Your next adventure.</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed md:px-8">
          Listings refreshed {refreshed} (AEST/AEDT) from Ticketmaster, Moshtix, Oztix, Eventbrite, Humanitix, Frontier Touring and City of Sydney.
          Times and prices can change — always check with the organiser before you go.
        </p>
        {quickLinks.length > 0 && (
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground md:max-w-[340px] md:justify-end">
            {quickLinks.map((l) => (
              <button key={l.label} onClick={l.onClick} className="hover:text-foreground transition-colors">{l.label}</button>
            ))}
          </nav>
        )}
      </div>
      <nav aria-label="Events by city" className="max-w-[1280px] mx-auto px-4 sm:px-6 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">What's on by city</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-muted-foreground">
          {CITIES.map((c) => (
            <Link key={c.name} href={cityPath(c)} className="hover:text-foreground transition-colors">Events in {c.name}</Link>
          ))}
        </div>
      </nav>
      <nav aria-label="Popular guides by city" className="max-w-[1280px] mx-auto px-4 sm:px-6 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Popular guides</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-5">
          {CITIES.map((c) => (
            <div key={c.name}>
              <p className="text-[13px] font-semibold text-foreground mb-1.5">{c.name}</p>
              <ul className="flex flex-col gap-1 text-[13px] text-muted-foreground">
                {POPULAR_GUIDES.map(([label, title, topic]) => (
                  <li key={topic}>
                    <Link href={cityPath(c, topic)} title={title(c.name)} aria-label={title(c.name)} className="hover:text-foreground transition-colors">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pb-10">
        <div className="rounded-xl bg-card/60 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
          <svg className="shrink-0 w-12 h-8 rounded-sm" viewBox="0 0 30 20" role="img" aria-label="Australian Aboriginal flag">
            <rect width="30" height="10" fill="#000" /><rect y="10" width="30" height="10" fill="#cc0000" /><circle cx="15" cy="10" r="5" fill="#ffcd00" />
          </svg>
          <p className="text-xs leading-relaxed text-muted-foreground flex-1">
            <span className="font-semibold text-foreground">Acknowledgement of Country. </span>{ACKNOWLEDGEMENT_OF_COUNTRY}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Outza is an independent listings guide — information only, no warranties.</span>
          <span className="flex gap-4">
            <Link href="/how-listings-work" className="hover:text-foreground underline underline-offset-2">How listings work</Link>
            <Link href="/privacy" className="hover:text-foreground underline underline-offset-2">Privacy</Link>
            <Link href="/disclaimer" className="hover:text-foreground underline underline-offset-2">Disclaimer</Link>
          </span>
        </div>
      </div>
    </footer>
  )
}
