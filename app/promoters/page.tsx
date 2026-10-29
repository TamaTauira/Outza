import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, BadgeCheck, BarChart3, CalendarPlus, Car, Check, Compass, CreditCard, Eye, Mail, Megaphone, ShieldCheck, Sparkles, Star, Utensils, Wine } from 'lucide-react'
import { auth } from '@/auth'
import { ADDONS, BUSINESS_PLANS, DURATIONS, LOCAL_AD, PRO_PLAN, TIERS, formatAud } from '@/lib/tiers'
import { Footer } from '@/components/footer'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { PlanInterest } from './plan-interest'
import { DashboardPreview } from './dashboard-preview'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'For promoters — VibePeep',
  description: 'Promote your events to people actively looking for something to do in 10 Australian cities. Boost, Spotlight and Headliner packages from $19.',
}

const addonIcons = { FRONTROW: Star, SPOTLIGHT: Mail } as const

export default async function PromotersPage() {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isPromoter = role === 'PROMOTER' || role === 'ADMIN'
  const primary = isPromoter
    ? { href: '/promoter', label: 'Go to your dashboard' }
    : session?.user ? { href: '/promoter', label: 'Switch to a promoter account' } : { href: '/signup?role=promoter', label: 'Create a free promoter account' }

  return (
    <div className="min-h-screen bg-background">
      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,122,26,0.22),transparent_60%)]" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <BackToEventsLink className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to events</BackToEventsLink>
            <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">For promoters, venues & organisers</p>
            <h1 className="mt-3 font-display text-4xl sm:text-6xl font-bold tracking-tight max-w-3xl leading-[1.02]">Get on the radar of people planning their next night out.</h1>
            <p className="mt-5 text-muted-foreground max-w-2xl">List for free. Boost when you’re ready. Zero lock-in.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={primary.href} className="h-12 px-6 rounded-md bg-primary text-primary-foreground font-semibold flex items-center">{primary.label}</Link>
              {!session?.user && <Link href="/login?next=/promoter" className="h-12 px-6 rounded-md border border-border font-semibold flex items-center hover:bg-muted">Promoter Sign In</Link>}
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <h2 className="font-display text-2xl sm:text-3xl font-bold">How it works</h2>
          <p className="mt-2 text-sm text-muted-foreground">Claim your event, verify it’s yours, pick a package, preview it, pay, and get a performance report.</p>
          <ol className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { Icon: CalendarPlus, t: 'Claim your event', b: 'Already on our board? Claim it in one click. Otherwise create it in under a minute — free.' },
              { Icon: ShieldCheck, t: 'Verify ownership', b: 'Claims are verified instantly when your email domain matches the event’s website; otherwise our team checks them by hand before the listing is yours.' },
              { Icon: Megaphone, t: 'Select a package', b: 'Boost, Spotlight or Headliner — or tap “Promote this event” right on your own listing.' },
              { Icon: Eye, t: 'Preview placement', b: 'The campaign builder shows a preview of your sponsored card and where it can appear before you pay.' },
              { Icon: CreditCard, t: 'Pay', b: 'One-off secure payment. Your campaign starts as soon as payment is confirmed.' },
              { Icon: BarChart3, t: 'Get your performance report', b: 'Views, ticket clicks, saves, RSVPs and traffic sources are live in your dashboard. Get a report emailed on demand, or weekly.' },
            ].map((s, i) => (
              <li key={s.t} className="rounded-xl bg-card border border-border p-6 shadow-sm">
                <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">{i + 1}</span><s.Icon className="w-5 h-5 text-primary" /></div>
                <p className="mt-4 font-semibold">{s.t}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.b}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-card/50 border-y border-border">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
            <h2 className="font-display text-2xl sm:text-3xl font-bold">Promotion packages</h2>
            <p className="mt-2 text-sm text-muted-foreground">Three clear packages, from {formatAud(TIERS[0].prices[7])}. Per event, one-off payment, AUD incl. GST. Other campaign lengths are available too.</p>
            <div className="mt-8 grid md:grid-cols-3 gap-5">
              {TIERS.map((t) => (
                <div key={t.key} className={`relative rounded-2xl bg-card border p-6 shadow-sm flex flex-col ${t.key === 'BRONZE' ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}>
                  {t.key === 'BRONZE' && <span className="absolute -top-3 left-6 rounded-full bg-primary text-primary-foreground text-[11px] font-bold px-2.5 py-0.5">MOST POPULAR</span>}
                  <span className="h-1.5 w-12 rounded-full" style={{ backgroundColor: t.color }} />
                  <p className="mt-4 font-display text-xl font-bold">{t.name}</p>
                  <p className="text-sm text-muted-foreground">{t.tagline}</p>
                  <p className="mt-4 text-4xl font-bold">{formatAud(t.prices[t.headlineDays])}<span className="text-sm font-normal text-muted-foreground"> / {t.headlineDays} days</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">Also: {DURATIONS.filter((d) => d.days !== t.headlineDays).map((d) => `${formatAud(t.prices[d.days])} for ${d.label}`).join(' · ')}</p>
                  <ul className="mt-5 space-y-2 flex-1">{t.perks.map((p) => <li key={p} className="flex gap-2 text-sm"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />{p}</li>)}</ul>
                  <Link href={primary.href} className={`mt-6 h-11 rounded-md font-semibold text-sm flex items-center justify-center ${t.key === 'BRONZE' ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'}`}>Choose {t.name}</Link>
                </div>
              ))}
            </div>

            <p className="mt-5 text-xs text-muted-foreground">Placements are subject to inventory and are always clearly labelled as sponsored. We don’t guarantee impressions or clicks.</p>
            <p className="mt-2 text-sm">Already listed your event? Open it on VibePeep while signed in and choose <strong>“Promote this event”</strong>.</p>

            <h3 className="mt-14 font-display text-xl font-bold">Add-ons</h3>
            <p className="mt-1 text-sm text-muted-foreground">Add to any package. They run for the same length as your campaign.</p>
            <div className="mt-5 grid md:grid-cols-2 gap-5">
              {ADDONS.map((a) => {
                const Icon = addonIcons[a.key]
                return (
                  <div key={a.key} className="rounded-xl bg-card border border-border p-5 shadow-sm flex gap-4">
                    <span className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
                    <div>
                      <p className="font-semibold">{a.name} <span className="text-primary">from {formatAud(a.prices[7])}</span></p>
                      <p className="text-sm text-muted-foreground mt-0.5">{a.desc}</p>
                      <p className="text-xs text-muted-foreground mt-1">{DURATIONS.map((d) => `${formatAud(a.prices[d.days])} / ${d.label}`).join(' · ')}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section id="plans" className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 scroll-mt-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">For bars, restaurants, venues, galleries, studios, activity providers, markets & regular organisers</p>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold">Business subscriptions</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">Monthly plans for businesses that run events all the time. Paid plans are coming soon — register your interest and we’ll tell you when they launch.</p>
          <div className="mt-6 rounded-2xl bg-card border border-border shadow-sm divide-y divide-border">
            {BUSINESS_PLANS.map((p) => (
              <div key={p.key} className="grid sm:grid-cols-[160px_110px_1fr_auto] gap-2 sm:gap-6 items-center px-5 sm:px-6 py-5">
                <p className="font-semibold flex items-center gap-2">{p.name}{!p.live && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Coming soon</span>}</p>
                <p className="text-xl font-bold tabular-nums sm:text-right">{formatAud(p.monthlyCents)}<span className="text-xs font-normal text-muted-foreground"> /mo</span></p>
                <p className="text-sm text-muted-foreground">{p.value}</p>
                <div className="sm:justify-self-end">
                  {p.live
                    ? <Link href={primary.href} className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center">{isPromoter ? 'Go to dashboard' : 'Start free'}</Link>
                    : <PlanInterest plan={p.name} signedIn={!!session?.user} />}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border-l-4 border-primary bg-primary/10 px-5 py-4">
            <p className="font-semibold">Our principle: we charge for better marketing tools, never for the basic ability to contribute quality events.</p>
            <p className="mt-1 text-sm text-muted-foreground">Free submissions help grow the listings that bring people to VibePeep — so listing stays free.</p>
          </div>
        </section>

        <section id="dashboard" className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 scroll-mt-20">
          <h2 className="font-display text-2xl sm:text-3xl font-bold">Your business dashboard</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl mb-6">Manage events, buy promotion packages and see measurable results — all in one place.</p>
          <DashboardPreview />
        </section>

        <section id="local" className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 scroll-mt-20">
          <div className="rounded-2xl bg-card border border-border p-8 sm:p-10 shadow-sm grid md:grid-cols-[1fr_auto] gap-8 items-center">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">For restaurants, bars, parking & experiences</p>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold">Local business ads — {formatAud(LOCAL_AD.priceCents)} per event</h2>
              <p className="mt-3 text-sm text-muted-foreground max-w-2xl">Get recommended to people who are already going. A restaurant near a theatre can sponsor a pre-show dinner pick; a car park can sit beneath the big game. Your business appears as a “Recommended” card beneath the event you choose, labelled Sponsored, until that event ends.</p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {[[Utensils, 'Dinner'], [Wine, 'Bar'], [Car, 'Parking'], [Compass, 'Experience']].map(([I, l]) => { const Icon = I as typeof Car; return <span key={l as string} className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 text-primary px-3 py-1 font-medium"><Icon className="w-4 h-4" />Recommended · {l as string}</span> })}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Sign in as a promoter, open any upcoming event and choose “Recommend your business here”. One-off payment, AUD incl. GST. Up to 6 businesses per event.</p>
            </div>
            <Link href={isPromoter ? '/promoter?tab=local' : primary.href} className="h-12 px-6 rounded-md bg-primary text-primary-foreground font-semibold flex items-center justify-center">{isPromoter ? 'Manage local ads' : 'Get started'}</Link>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <div className="rounded-2xl p-8 sm:p-10 bg-gradient-to-br from-primary/25 via-card to-card border border-primary/40 grid md:grid-cols-[1fr_auto] gap-8 items-center">
            <div>
              <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">For regular promoters</p></div>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold">{PRO_PLAN.name} — {formatAud(PRO_PLAN.priceCents)} for {PRO_PLAN.days} days</h2>
              <ul className="mt-4 grid sm:grid-cols-2 gap-2">{PRO_PLAN.perks.map((p) => <li key={p} className="flex gap-2 text-sm"><BadgeCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />{p}</li>)}</ul>
              <p className="mt-3 text-xs text-muted-foreground">Pays for itself once you spend about {formatAud(Math.ceil(PRO_PLAN.priceCents / (PRO_PLAN.discountPct / 100) / 100) * 100)} on promotions in a month.</p>
            </div>
            <Link href={primary.href} className="h-12 px-6 rounded-md bg-primary text-primary-foreground font-semibold flex items-center justify-center">{isPromoter ? 'Get Pro in your dashboard' : 'Get started'}</Link>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
          <h2 className="font-display text-2xl font-bold">Good to know</h2>
          <div className="mt-5 grid md:grid-cols-2 gap-4">
            {[
              ['Is listing free?', 'Yes. Creating or claiming an event is always free. You only pay when you choose to promote it.'],
              ['When does my campaign start?', 'Straight away, as soon as payment is confirmed. If you buy again for the same event, the new time is added on to the end.'],
              ['Where does my event appear?', 'Boost and Spotlight show in the Featured band for your event’s city, and Spotlight adds a highlighted map pin. Headliner and Front-row placement show in every city, and Headliner events are eligible for subscriber newsletters. All placements are labelled as sponsored.'],
              ['Is there a contract?', 'No. Every package is a one-off payment. Promoter Pro is a 30-day pass you can extend whenever you like.'],
            ].map(([q, a]) => (
              <div key={q} className="rounded-xl bg-card border border-border p-5">
                <p className="font-semibold">{q}</p>
                <p className="text-sm text-muted-foreground mt-1">{a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer lastRefresh={null} />
    </div>
  )
}
