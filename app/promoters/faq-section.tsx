import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown, Headphones } from 'lucide-react'
import { BOOSTS } from '@/lib/sponsorship'
import { LOCAL_AD, PRO_PLAN, formatAud } from '@/lib/tiers'
import { ctaClass, sectionPad } from './styles'

const proPayback = formatAud(Math.ceil(PRO_PLAN.priceCents / (PRO_PLAN.discountPct / 100) / 100) * 100)

export function FaqSection() {
  const items: { q: string; a: ReactNode }[] = [
    {
      q: 'Is listing free?',
      a: 'Yes. Creating or claiming an event is always free. You only pay when you choose to promote it.',
    },
    {
      q: 'When does my campaign start?',
      a: 'Straight away, as soon as payment is confirmed. If you buy again for the same event, the new time is added on to the end.',
    },
    {
      q: 'Where does my event appear?',
      a: 'Boost, Spotlight and Headliner show in the Featured band for your event’s city. Headliner ranks above Spotlight, which ranks above Boost. Front-row placement is the add-on that can show in every city. Headliner events are eligible for subscriber newsletters. Every placement is labelled Sponsored.',
    },
    {
      q: 'Is there a contract?',
      a: 'No. Every package is a one-off payment. Promoter Pro is a 30-day pass you can extend whenever you like.',
    },
    {
      q: 'Can I promote more than one event?',
      a: 'Yes. A package is for one event, and you can buy one for each event on your dashboard. Buying the same package again for an event adds the new time on to the end.',
    },
    {
      q: 'What happens when my promotion ends?',
      a: <>The sponsored placement stops when the days you paid for run out. A campaign is not refunded because it finishes before the event date, or because fewer people opened the listing than you hoped. If we take payment and the campaign never goes live because of a fault on our side, write to us with the invoice number. The <Link href="/refunds" className="font-semibold underline underline-offset-2">refunds page</Link> has the full rules.</>,
    },
    {
      q: 'How does pricing for different durations work?',
      a: `Each package and add-on has its own price for 7, 14 and 30 days, in AUD including GST. The price on the card is the price for that length. There is no duration discount. ${PRO_PLAN.name} takes ${PRO_PLAN.discountPct}% off packages, add-ons and short boosts while that pass is active.`,
    },
    {
      q: 'What’s included in Promoter Pro?',
      a: `${PRO_PLAN.name} is ${formatAud(PRO_PLAN.priceCents)} for ${PRO_PLAN.days} days, and you can extend it any time. It includes ${PRO_PLAN.perks.join('; ')}. It pays for itself once you spend about ${proPayback} on promotions in a month. Ending it from billing stops the discount and the unlocked analytics. It does not refund the days already paid.`,
    },
    {
      q: 'Can I upgrade or downgrade?',
      a: 'Local Pro, Growth and Venue Plus are not on sale from this page. Request a quote and nothing is charged. When a monthly plan is on sale, an upgrade charges the difference then, and a downgrade waits for the next renewal. Buying a higher package for an event does not cancel the days you already paid for.',
    },
    {
      q: 'What about a monthly plan’s free month?',
      a: 'When monthly billing is switched on, a plan can start with one free month. The first 30 days are free, then the plan price is charged in AUD, then the same amount each month until you cancel. Cancel before the free month ends and you will not be charged. Nothing is charged until you tick the box in the dashboard. If card billing is not switched on, the dashboard takes a quote instead and does not charge a card.',
    },
    {
      q: 'What is a short boost?',
      a: `An evening pass is ${formatAud(BOOSTS.EVENING.priceCents)} for up to 6 hours, and a day pass is ${formatAud(BOOSTS.DAY_PASS.priceCents)} for up to 24 hours. Each is a Sponsored card in Hot right now for your event’s city, bought from the promoter dashboard. They are separate from the 7, 14 and 30 day packages. ${PRO_PLAN.name} takes ${PRO_PLAN.discountPct}% off them too. A boost that has not been shown can be refunded from the dashboard within 48 hours of the start you picked, or 7 days on Venue Plus.`,
    },
    {
      q: 'How do local recommendations work?',
      a: `${formatAud(LOCAL_AD.priceCents)} per event, AUD incl. GST. The ad runs until that event ends. Up to 6 businesses per event, always labelled Sponsored. You can cancel a live recommendation from Local business ads. Cancelling removes it from the event page. The fee is not refunded, because the spot was reserved for that event.`,
    },
    {
      q: 'Do you guarantee views or clicks?',
      a: 'No. Placements are subject to inventory and are always clearly labelled as sponsored. We don’t guarantee impressions or clicks.',
    },
  ]

  return (
    <section id="faq" className="scroll-mt-24 py-12 sm:py-16">
      <div className={`${sectionPad} grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]`}>
        <div className="min-w-0">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Questions? We’ve got you.</h2>
          <div className="mt-6 grid items-start gap-3 md:grid-cols-2">
            {items.map((item) => (
              <details key={item.q} className="group min-w-0 rounded-2xl border border-border bg-card px-4 shadow-sm">
                <summary className="cursor-pointer list-none text-left text-sm font-semibold [&::-webkit-details-marker]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9F1239]">
                  <span className="flex min-h-12 items-center justify-between gap-3 py-4">
                    {item.q}
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                  </span>
                </summary>
                <div className="pb-4 text-sm leading-relaxed text-muted-foreground">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
        <aside className="rounded-3xl bg-[#0c0c0e] p-6 text-white lg:sticky lg:top-24">
          <Headphones className="h-8 w-8 text-[#FF8A1A]" aria-hidden />
          <h3 className="mt-4 font-display text-2xl font-bold">Still have questions?</h3>
          <p className="mt-2 text-sm text-white/80">Write to us about a listing, a purchase or your account. The contact page says where that note goes.</p>
          <Link href="/contact" className={`${ctaClass} mt-6 w-full`}>Contact</Link>
        </aside>
      </div>
    </section>
  )
}
