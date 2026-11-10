import Link from 'next/link'
import { BadgeCheck, BarChart3, Building2, CalendarPlus, Car, Compass, LineChart, Megaphone, SlidersHorizontal, Ticket, Utensils, Wine } from 'lucide-react'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { BUSINESS_PLANS, LOCAL_AD, PRO_PLAN, formatAud } from '@/lib/tiers'
import { DashboardPreview } from './dashboard-preview'
import { HeroStage } from './hero-stage'
import { PlanInterest } from './plan-interest'
import { ctaClass, ghostOnDark, sectionPad } from './styles'

const proPayback = formatAud(Math.ceil(PRO_PLAN.priceCents / (PRO_PLAN.discountPct / 100) / 100) * 100)

const PATHS = [
  {
    href: '#packages',
    title: 'Promote an event',
    body: 'Got something happening? Give it the visibility it deserves.',
    meta: 'Boost, Spotlight or Headliner',
    Icon: Ticket,
  },
  {
    href: '#plans',
    title: 'Grow my venue or business',
    body: 'Make your business a local favourite.',
    meta: 'Business plans',
    Icon: Building2,
  },
  {
    href: '#local',
    title: 'Advertise my business',
    body: 'Get in front of people who are already making plans.',
    meta: 'Local advertising',
    Icon: Megaphone,
  },
] as const

const STEPS = [
  { n: '01', title: 'Claim', Icon: CalendarPlus, body: 'Claim a listing already on the board, or create one free. A matching email domain is accepted straight away; otherwise we check the claim by hand.' },
  { n: '02', title: 'Boost', Icon: Megaphone, body: 'Pick Boost, Spotlight or Headliner, preview the sponsored card, and pay once. It starts as soon as payment is confirmed.' },
  { n: '03', title: 'Report', Icon: BarChart3, body: 'Results shows the day-by-day read, the funnel, reactions, Spotlight and where people saw the listing. Views and clicks unlock when the event is promoted, or with Promoter Pro. Email a recap weekly, or when you ask.' },
] as const

const PLAN_POINTS: Record<string, string[]> = {
  FREE: ['List events for free', 'Buy a one-off boost when you want the extra eyes'],
  LOCAL_PRO: ['Five short boosts at once', 'Plan invoices', 'Cancel or switch without emailing us'],
  GROWTH: ['Fifteen short boosts', 'Schedule 60 days ahead', 'Hourly results and a CSV export'],
  VENUE_PLUS: ['Forty short boosts', 'Pause the lot', 'A 7-day refund window when a boost has not been shown'],
}

export function Hero({ primaryHref, primaryLabel, showSignIn }: { primaryHref: string; primaryLabel: string; showSignIn: boolean }) {
  return (
    <section className="overflow-x-clip bg-[#0c0c0e] text-white">
      <div className={`${sectionPad} grid items-center gap-10 py-8 sm:py-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:py-14`}>
        <div className="min-w-0">
          <BackToEventsLink className="inline-flex items-center text-sm text-white/70 underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            Back to events
          </BackToEventsLink>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-[#FF8A1A]">VibePeep for promoters</p>
          <h1 className="mt-3 font-display text-[2.6rem] font-bold leading-[0.95] tracking-tight sm:text-6xl">
            More eyes. <span className="text-brand-gradient">More vibes.</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/90">Get your event in front of the people who want to go.</p>
          <p className="mt-2 max-w-xl text-white/75">List for free. Promote when you’re ready. See what works.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={primaryHref} className={ctaClass}>{primaryLabel}</Link>
            <a href="#how" className={ghostOnDark}>See how it works</a>
          </div>
          {showSignIn && (
            <p className="mt-3 text-sm text-white/75">
              Already a promoter? <Link href="/login?next=/promoter" className="font-semibold text-white underline underline-offset-4">Sign in</Link>
            </p>
          )}
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/85">
            {[
              [Ticket, 'Free event listings'],
              [SlidersHorizontal, 'Flexible promotion options'],
              [LineChart, 'Measurable results'],
            ].map(([Icon, label]) => {
              const ItemIcon = Icon as typeof Ticket
              return (
                <li key={label as string} className="inline-flex items-center gap-2">
                  <ItemIcon className="h-4 w-4 text-[#FF8A1A]" aria-hidden />
                  {label as string}
                </li>
              )
            })}
          </ul>
        </div>
        <HeroStage />
      </div>
    </section>
  )
}

export function PathCards() {
  return (
    <section id="paths" className="scroll-mt-24 py-12 sm:py-14">
      <div className={sectionPad}>
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Choose what you want to do</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {PATHS.map((path) => (
            <a
              key={path.href}
              href={path.href}
              className="group flex min-w-0 flex-col rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9F1239] motion-reduce:transform-none"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#9A3412,#9F1239)] text-white">
                <path.Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-xl font-bold">{path.title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{path.body}</p>
              <p className="mt-4 text-sm font-semibold text-[#9F1239]">{path.meta}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 border-y border-border bg-card/50 py-10 sm:py-12">
      <div className={sectionPad}>
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#141418] font-mono text-xs font-bold text-white">{step.n}</span>
                <step.Icon className="h-5 w-5 text-[#9A3412]" aria-hidden />
                <h3 className="font-semibold">{step.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function BusinessPlans({ primaryHref, isPromoter, signedIn }: { primaryHref: string; isPromoter: boolean; signedIn: boolean }) {
  return (
    <section id="plans" className="scroll-mt-24 bg-card/40 py-12 sm:py-16">
      <div className={sectionPad}>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9F1239]">Monthly · separate from one-off packages</p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Built for businesses that do more.</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">For venues, organisers and businesses that have things happening regularly.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {BUSINESS_PLANS.map((plan) => (
            <article key={plan.key} data-testid={`plan-${plan.key}`} className="flex min-w-0 flex-col rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-xl font-bold">{plan.name}</h3>
                {!plan.live && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Coming soon</span>}
              </div>
              <p className="mt-3 font-display text-4xl font-bold tabular-nums">
                {formatAud(plan.monthlyCents)}
                <span className="text-sm font-normal text-muted-foreground">{plan.monthlyCents ? ' / month' : ''}</span>
              </p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">{plan.live ? 'No monthly fee' : 'Monthly subscription · not for sale yet'}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
                {(PLAN_POINTS[plan.key] ?? [plan.value]).map((point) => <li key={point}>{point}</li>)}
              </ul>
              <div className="mt-5">
                {plan.live
                  ? <Link href={primaryHref} className={`${ctaClass} w-full`}>{isPromoter ? 'Go to dashboard' : 'Start free'}</Link>
                  : <PlanInterest plan={plan.name} signedIn={signedIn} />}
              </div>
            </article>
          ))}
        </div>
        <p className="mt-5 text-sm text-muted-foreground">Subscribe from the promoter dashboard once a plan is on sale. If card billing is not switched on, the dashboard takes a quote instead and does not charge a card. Listing an event stays free. Coming soon plans on this page can’t be bought.</p>
        <div className="mt-5 rounded-2xl border-l-4 border-[#9A3412] bg-[#9A3412]/10 px-5 py-4">
          <p className="font-semibold">Our principle: we charge for better marketing tools, never for the basic ability to contribute quality events.</p>
          <p className="mt-1 text-sm text-muted-foreground">Free submissions help grow the listings that bring people to VibePeep — so listing stays free.</p>
        </div>
      </div>
    </section>
  )
}

export function LocalAds({ href, label }: { href: string; label: string }) {
  return (
    <section id="local" className="scroll-mt-24 py-12 sm:py-16">
      <div className={`${sectionPad} grid items-center gap-8 lg:grid-cols-2`}>
        <figure className="min-w-0 rounded-3xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Event listing</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">Illustrative</span>
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1c1917,#9A3412)] p-4 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">Live music</p>
            <p className="mt-2 font-display text-2xl font-bold">Boogie Nights</p>
            <p className="mt-1 text-sm text-white/80">Sat · 9:00 pm · The Roundhouse · Sydney</p>
          </div>
          <div className="mt-3 rounded-2xl border border-dashed border-[#9F1239]/40 bg-[#9F1239]/5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-black px-1.5 py-0.5 text-[10px] font-bold text-white">SPONSORED</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9F1239]">Recommended</span>
            </div>
            <p className="mt-2 font-semibold">The Late Kitchen</p>
            <p className="text-sm text-muted-foreground">Pre-show dining, a short walk from the door. Made-up example.</p>
          </div>
          <figcaption className="mt-3 text-xs text-muted-foreground">Illustrative. This event and business are not real listings.</figcaption>
        </figure>
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9F1239]">For restaurants, bars, parking and experiences</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Get recommended. Get noticed.</h2>
          <p className="mt-2 text-muted-foreground">Your next customers might already be deciding where to go.</p>
          <p className="mt-4 font-display text-4xl font-bold tabular-nums" data-testid="local-price">
            {formatAud(LOCAL_AD.priceCents)}
            <span className="text-base font-normal text-muted-foreground"> per event · AUD incl. GST</span>
          </p>
          <p className="mt-3 text-sm text-muted-foreground">{LOCAL_AD.desc}</p>
          <ul className="mt-4 flex flex-wrap gap-2 text-sm">
            {[[Utensils, 'Pre-show dining'], [Wine, 'Nearby bars'], [Car, 'Parking'], [Compass, 'Experiences']].map(([Icon, name]) => {
              const ItemIcon = Icon as typeof Car
              return <li key={name as string} className="inline-flex items-center gap-1.5 rounded-full bg-[#9A3412]/10 px-3 py-1 font-medium text-[#9A3412]"><ItemIcon className="h-4 w-4" aria-hidden />{name as string}</li>
            })}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">The ad runs until the event ends. Up to 6 businesses per event. Sign in as a promoter, open an upcoming event and choose “Recommend your business here”. Always labelled Sponsored.</p>
          <Link href={href} className={`${ctaClass} mt-6`}>{label}</Link>
        </div>
      </div>
    </section>
  )
}

export function ProBand({ href, label }: { href: string; label: string }) {
  const otherPerks = PRO_PLAN.perks.filter((perk) => !perk.startsWith(`${PRO_PLAN.discountPct}%`))
  return (
    <section id="pro" className="scroll-mt-24 bg-[#0c0c0e] py-12 text-white sm:py-16">
      <div className={`${sectionPad} grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]`}>
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#FF8A1A]">For people who promote more than once</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-5xl">Promote more. Save more.</h2>
          <p className="mt-4 max-w-xl text-4xl font-bold leading-tight text-brand-gradient sm:text-5xl">{PRO_PLAN.discountPct}% off</p>
          <p className="mt-2 max-w-xl text-lg text-white/85">packages, add-ons and short boosts, while the pass is active.</p>
          <ul className="mt-6 space-y-2">
            {otherPerks.map((perk) => (
              <li key={perk} className="flex gap-2 text-sm text-white/90">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#FF8A1A]" aria-hidden />
                {perk}
              </li>
            ))}
            <li className="flex gap-2 text-sm text-white/90">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#FF8A1A]" aria-hidden />
              Extend any time. Ending it does not refund the days already paid.
            </li>
          </ul>
        </div>
        <div className="min-w-0 rounded-3xl border border-white/10 bg-[#16161a] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
          <p className="font-display text-5xl font-bold tabular-nums" data-testid="pro-price">{formatAud(PRO_PLAN.priceCents)}</p>
          <p className="mt-1 text-white/75">for {PRO_PLAN.days} days · extend any time</p>
          <p className="mt-4 text-sm text-white/80">Pays for itself once you spend about {proPayback} on promotions in a month.</p>
          <p className="mt-3 text-sm text-white/75">While Promoter Pro is on, views, Get tickets, More info, where a listing was seen, search terms and Spotlight spend unlock for every event you run. A promotion unlocks the same reads for that event. Reactions, saves and going stay visible either way.</p>
          <Link href={href} className={`${ctaClass} mt-6 w-full`}>{label}</Link>
        </div>
      </div>
    </section>
  )
}

export function DashboardSection() {
  return (
    <section id="dashboard" className="scroll-mt-24 py-12 sm:py-16">
      <div className={sectionPad}>
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Your events. Your numbers. Your next move.</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Manage events, buy promotions and see what’s working — all in one place.</p>
        <div className="mt-8">
          <DashboardPreview />
        </div>
      </div>
    </section>
  )
}

export function FinalCta({ href, label }: { href: string; label: string }) {
  return (
    <section className="bg-[#0c0c0e] py-14 text-white sm:py-16">
      <div className={`${sectionPad} text-center`}>
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">Ready to get on the radar?</h2>
        <p className="mx-auto mt-3 max-w-xl text-lg text-white/80">Your event deserves an audience. Let’s get it out there.</p>
        <Link href={href} className={`${ctaClass} mt-6`}>{label}</Link>
        <p className="mt-4 text-sm text-white/70">Free to list. Flexible promotion. No lock-in.</p>
      </div>
    </section>
  )
}
