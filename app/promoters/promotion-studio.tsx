'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { BOOSTS } from '@/lib/sponsorship'
import { DURATIONS, TIERS, formatAud, isDuration, type Duration } from '@/lib/tiers'
import { ctaClass, sectionPad } from './styles'

const HEADER: Record<string, string> = {
  SILVER: 'var(--vp-brand-orange-ink)',
  BRONZE: 'var(--vp-brand-pink)',
  GOLD: 'linear-gradient(105deg, var(--vp-brand-orange-ink) 0%, var(--vp-brand-pink) 100%)',
}

const PACKAGE_SLUG: Record<string, string> = { SILVER: 'boost', BRONZE: 'spotlight', GOLD: 'headliner' }

function promoteHref(isPromoter: boolean, tier: string, days: Duration) {
  const slug = PACKAGE_SLUG[tier] ?? 'boost'
  const dest = `/promoter?tab=promote&package=${slug}&duration=${days}`
  return isPromoter ? dest : `/signup?role=promoter&package=${slug}&duration=${days}&next=${encodeURIComponent(dest)}`
}

const PLACEMENT: Record<string, string> = {
  SILVER: 'Featured row in your event’s city, labelled Sponsored.',
  BRONZE: 'Same Featured row, ranked above Boost.',
  GOLD: 'Top of the Featured row for your event’s city.',
}

export function PromotionStudio({ isPromoter }: { isPromoter: boolean }) {
  const [days, setDays] = useState<Duration>(7)

  const choose = (next: number) => {
    if (isDuration(next)) setDays(next)
  }

  return (
    <>
      <section id="packages" className="scroll-mt-24 border-y border-border bg-card/40 py-12 sm:py-16">
        <div className={sectionPad}>
          <p className="text-xs font-semibold text-[var(--vp-brand-orange-ink)]">One-off · per event · AUD incl. GST</p>
          <h2 className="mt-2 max-w-3xl font-display text-3xl font-bold tracking-tight sm:text-4xl">Give your event the spotlight.</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">Three ways to get noticed. One easy way to get started.</p>

          <div className="mt-8 grid items-stretch gap-[var(--vp-card-gap)] xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="order-1 xl:order-2">
              <DurationPanel days={days} onChange={choose} />
            </div>
            <div className="order-2 grid items-stretch gap-[var(--vp-card-gap)] md:grid-cols-2 xl:order-1 xl:grid-cols-3">
              {TIERS.map((tier) => {
                const perDay = Math.round(tier.prices[days] / days)
                return (
                  <article
                    key={tier.key}
                    data-testid={`package-${tier.key}`}
                    data-days={days}
                    data-price={tier.prices[days]}
                    className="flex min-w-0 flex-col overflow-hidden rounded-hero bg-[var(--vp-banner)] text-white ring-1 ring-white/10"
                  >
                    <header className="px-5 py-4 text-white" style={{ background: HEADER[tier.key] }}>
                      <h3 className="font-display text-xl font-bold">{tier.name}</h3>
                      <p className="mt-1 text-sm text-white">{PLACEMENT[tier.key]}</p>
                    </header>
                    <div className="flex flex-1 flex-col p-5">
                      <p className="font-display text-4xl font-bold tabular-nums" aria-live="polite">
                        {formatAud(tier.prices[days])}
                        <span className="text-base font-normal text-white/80"> / {days} days</span>
                      </p>
                      <p className="mt-1 text-xs font-medium text-white/80">{formatAud(perDay)} per day. Longer runs cost less per day.</p>
                      <ul className="mt-4 flex-1 space-y-2">
                        {tier.perks.map((perk) => (
                          <li key={perk} className="flex gap-2 text-sm text-white/90">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vp-brand-orange)]" aria-hidden />
                            {perk}
                          </li>
                        ))}
                      </ul>
                      <Link href={promoteHref(isPromoter, tier.key, days)} className={`${ctaClass} mt-4 w-full`}>
                        Choose {tier.name}
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-background px-4 py-4">
            <p className="font-semibold">Last minute?</p>
            <p className="mt-1 text-sm text-muted-foreground">Evening pass {formatAud(BOOSTS.EVENING.priceCents)}, day pass {formatAud(BOOSTS.DAY_PASS.priceCents)}. Each is a Sponsored card in Coming up next, bought from the promoter dashboard.</p>
          </div>
          <p className="mt-5 text-sm">One-off payment. Guaranteed placement for the days you buy, subject to inventory. No guarantee of ticket sales.</p>
          <p className="mt-2 text-sm text-muted-foreground">Already listed your event? Open it while signed in and choose Promote this event. Add-ons are chosen in checkout, not on this page.</p>
        </div>
      </section>

    </>
  )
}

function DurationPanel({ days, onChange }: { days: Duration; onChange: (days: number) => void }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-sm xl:sticky xl:top-24">
      <h3 className="text-xs font-semibold text-muted-foreground">Choose your duration</h3>
      <p className="mt-1 text-xs text-muted-foreground" id="duration-hint">Sets the length on all three packages. Default is 7 days.</p>
      <div role="radiogroup" aria-label="Campaign length" aria-describedby="duration-hint" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
        {DURATIONS.map((d) => {
          const on = days === d.days
          return (
            <button
              key={d.days}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(d.days)}
              className={`min-h-12 rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vp-brand-orange-ink)] ${on ? 'border-[var(--vp-brand-orange-ink)] bg-[var(--vp-brand-orange-ink)] text-white' : 'border-border bg-background hover:border-[var(--vp-brand-orange-ink)]/50'}`}
            >
              {d.label}
            </button>
          )
        })}
      </div>
      <ul className="mt-4 space-y-1.5 text-sm" aria-live="polite">
        {TIERS.map((tier) => (
          <li key={tier.key} className="flex items-baseline justify-between gap-3">
            <span>{tier.name}</span>
            <span className="font-semibold tabular-nums">{formatAud(tier.prices[days])}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
