'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Sparkles } from 'lucide-react'
import { ADDONS, DURATIONS, PRO_PLAN, TIERS, formatAud, isDuration, type Duration } from '@/lib/tiers'
import { ctaClass, sectionPad } from './styles'

const HEADER: Record<string, string> = {
  SILVER: '#9A3412',
  BRONZE: '#9F1239',
  GOLD: 'linear-gradient(105deg,#9A3412 0%,#9F1239 100%)',
}

function promoteHref(isPromoter: boolean, tier: string, days: Duration) {
  const dest = `/promoter?tab=promote&tier=${tier}&days=${days}`
  return isPromoter ? dest : `/signup?role=promoter&next=${encodeURIComponent(dest)}`
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
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9F1239]">One-off · per event · AUD incl. GST</p>
          <h2 className="mt-2 max-w-3xl font-display text-3xl font-bold tracking-tight sm:text-4xl">Give your event the spotlight.</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">Three ways to get noticed. One easy way to get started.</p>

          <div className="mt-8 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="order-1 xl:order-2">
              <DurationPanel days={days} onChange={choose} />
            </div>
            <div className="order-2 grid gap-4 md:grid-cols-2 xl:order-1 xl:grid-cols-3">
              {TIERS.map((tier) => {
                const recommended = tier.key === 'BRONZE'
                return (
                  <article
                    key={tier.key}
                    data-testid={`package-${tier.key}`}
                    data-days={days}
                    data-price={tier.prices[days]}
                    className={`flex min-w-0 flex-col overflow-hidden rounded-3xl bg-[#141418] text-white shadow-[0_16px_40px_rgba(0,0,0,0.12)] ${recommended ? 'ring-2 ring-[#9F1239]' : 'ring-1 ring-black/10'}`}
                  >
                    <header className="px-5 py-4 text-white" style={{ background: HEADER[tier.key] }}>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-xl font-bold">{tier.name}</h3>
                        {recommended && <span className="shrink-0 rounded-full border border-white/40 bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">Recommended</span>}
                      </div>
                      <p className="mt-1 text-sm text-white">{tier.tagline}</p>
                    </header>
                    <div className="flex flex-1 flex-col p-5">
                      <p className="font-display text-4xl font-bold tabular-nums" aria-live="polite">
                        {formatAud(tier.prices[days])}
                        <span className="text-base font-normal text-white/80"> / {days} days</span>
                      </p>
                      <p className="mt-1 text-xs font-medium text-white/80">One-off payment, not a subscription.</p>
                      <p className="mt-3 text-xs leading-relaxed text-white/80">
                        {DURATIONS.map((d) => `${d.label} ${formatAud(tier.prices[d.days])}`).join(' · ')}
                      </p>
                      <ul className="mt-4 flex-1 space-y-2">
                        {tier.perks.map((perk) => (
                          <li key={perk} className="flex gap-2 text-sm text-white/90">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#FF8A1A]" aria-hidden />
                            {perk}
                          </li>
                        ))}
                      </ul>
                      <label className="mt-5 block">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">{tier.name} length</span>
                        <select
                          value={days}
                          onChange={(e) => choose(Number(e.target.value))}
                          className="mt-1 h-12 w-full rounded-xl border border-white/15 bg-[#1c1c22] px-3 text-base text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8A1A]"
                        >
                          {DURATIONS.map((d) => (
                            <option key={d.days} value={d.days}>{d.label} — {formatAud(tier.prices[d.days])}</option>
                          ))}
                        </select>
                      </label>
                      <Link href={promoteHref(isPromoter, tier.key, days)} className={`${ctaClass} mt-4 w-full`}>
                        Choose {tier.name}
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>

          <p className="mt-5 text-xs text-muted-foreground">Placements are subject to inventory and are always clearly labelled as sponsored. We don’t guarantee impressions or clicks.</p>
          <p className="mt-2 text-sm">Already listed your event? Open it on VibePeep while signed in and choose <strong>“Promote this event”</strong>.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            A shorter run is separate from these packages. An evening pass and a day pass are bought in the promoter dashboard. The prices are in the questions below, and on the <Link href="/pricing" className="font-semibold text-foreground underline underline-offset-2">pricing page</Link>.
          </p>
        </div>
      </section>

      <section id="addons" className="scroll-mt-24 py-12 sm:py-16">
        <div className={sectionPad}>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Make your campaign go further.</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">Already promoting? Add a little extra reach. Add-ons run for the same length as the campaign, and the length above prices them.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ADDONS.map((addon) => (
              <article key={addon.key} data-testid={`addon-${addon.key}`} data-days={days} data-price={addon.prices[days]} className="flex min-w-0 flex-col rounded-3xl border border-border bg-card p-5 shadow-sm">
                <h3 className="font-display text-xl font-bold">{addon.name}</h3>
                <p className="mt-3 font-display text-3xl font-bold tabular-nums">
                  {formatAud(addon.prices[days])}
                  <span className="text-sm font-normal text-muted-foreground"> / {days} days</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{DURATIONS.map((d) => `${d.label} ${formatAud(addon.prices[d.days])}`).join(' · ')} · AUD incl. GST · one-off</p>
                <p className="mt-3 flex-1 text-sm text-muted-foreground">{addon.desc}</p>
                <label className="mt-4 block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{addon.name} length</span>
                  <select
                    value={days}
                    onChange={(e) => choose(Number(e.target.value))}
                    className="mt-1 h-12 w-full rounded-xl border border-border bg-background px-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9F1239]"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d.days} value={d.days}>{d.label} — {formatAud(addon.prices[d.days])}</option>
                    ))}
                  </select>
                </label>
                <p className="mt-3 text-xs text-muted-foreground">Added in checkout with a package. It can’t be bought on its own.</p>
              </article>
            ))}
            <aside className="flex min-w-0 flex-col justify-between rounded-3xl bg-[#0c0c0e] p-5 text-white shadow-lg md:col-span-2 xl:col-span-1">
              <div>
                <Sparkles className="h-5 w-5 text-[#FF8A1A]" aria-hidden />
                <h3 className="mt-3 font-display text-2xl font-bold">Save {PRO_PLAN.discountPct}% with {PRO_PLAN.name}</h3>
                <p className="mt-2 text-sm text-white/80">{PRO_PLAN.discountPct}% off packages, add-ons and short boosts. {formatAud(PRO_PLAN.priceCents)} for {PRO_PLAN.days} days.</p>
              </div>
              <a href="#pro" className={`${ctaClass} mt-6 w-full sm:w-auto`}>See {PRO_PLAN.name}</a>
            </aside>
          </div>
        </div>
      </section>
    </>
  )
}

function DurationPanel({ days, onChange }: { days: Duration; onChange: (days: number) => void }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-sm xl:sticky xl:top-24">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Choose your duration</h3>
      <p className="mt-1 text-xs text-muted-foreground" id="duration-hint">Sets the length on every package and add-on. Each length has its own price.</p>
      <div role="radiogroup" aria-label="Campaign length" aria-describedby="duration-hint" className="mt-3 grid grid-cols-3 gap-2 xl:grid-cols-1">
        {DURATIONS.map((d) => {
          const on = days === d.days
          return (
            <button
              key={d.days}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(d.days)}
              className={`min-h-12 rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9F1239] ${on ? 'border-[#9A3412] bg-[#9A3412] text-white' : 'border-border bg-background hover:border-[#9A3412]/50'}`}
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
        {ADDONS.map((addon) => (
          <li key={addon.key} className="flex items-baseline justify-between gap-3 text-muted-foreground">
            <span>{addon.name}</span>
            <span className="tabular-nums">{formatAud(addon.prices[days])}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
