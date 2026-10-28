import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { ANALYTICS_DATA } from '@/lib/trust-shared'

export const metadata: Metadata = {
  title: 'How Outza listings work — sources, verification and sponsored content',
  description: 'Where Outza event listings come from, how we verify and merge them, how sponsored placements are labelled, and exactly what we measure for organisers.',
  alternates: { canonical: '/how-listings-work' },
}

const SECTIONS: { title: string; body: string[] }[] = [
  { title: 'Where listings come from', body: [
    'We collect public event information from Ticketmaster, Moshtix, Oztix, Eventbrite, Humanitix, Frontier Touring, City of Sydney and official venue and market websites, and from organisers who list events with us directly.',
    'Every listing keeps its original source, a link to the original listing and the time we last successfully checked it. You’ll see “Last verified … from …” and “View original listing” on each event page.',
  ] },
  { title: 'What we never make up', body: [
    'We never invent prices, dates or ticket availability. If a source doesn’t publish a price we say so. Accessibility, age and transport details appear only when the organiser or source provides them.',
    'Ticket status (for example sold out) is shown only when the source reports it, with the source named. It is not live availability; always check with the ticket seller.',
    'Cancelled, postponed and rescheduled events are flagged when the source reports it. Past and cancelled events are removed from city guides and from search-engine sitemaps.',
  ] },
  { title: 'Duplicates', body: [
    'The same event often appears on several ticketing sites. We merge these into one listing and keep every source attached, so you can still see where the information came from.',
  ] },
  { title: 'Found a mistake?', body: [
    'Use "Something not right? Tell us" on any event page. We check reports against the original source before changing anything.',
    'Organisers can claim their listing for free. If your account email uses the same domain as the event’s website you’re verified straight away; otherwise our team reviews the claim. Verified organisers can correct details and promote the event.',
  ] },
  { title: 'Sponsored placements', body: [
    'Organisers and local businesses can pay for extra visibility. Paid placements are always labelled “Sponsored” or “Featured”, in the newsletter too. Payment never changes the facts shown about an event, and we never promise guaranteed sales, impressions or clicks.',
    ...(process.env.NEXT_PUBLIC_TICKETEK_AFFILIATE_LINK ? ['Some ticket links (for example to Ticketek) are affiliate links. If you buy through them we may earn a small commission, at no extra cost to you. It never changes which events we show or the facts about them.'] : []),
  ] },
  { title: 'Images and content', body: [
    'Event artwork comes from the organiser or the source listing and is shown unaltered (we may enlarge it, but never redraw, crop out text or generate it). We link back to the original listing and remove content on request from its owner.',
  ] },
]

export default function HowListingsWorkPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <BackToEventsLink className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to events</BackToEventsLink>
      <h1 className="mt-6 font-display text-3xl sm:text-4xl font-bold tracking-tight">How Outza listings work</h1>
      <p className="mt-3 text-muted-foreground">Plain-English answers about where our event information comes from and how we keep it honest.</p>
      <div className="mt-10 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.title} className="rounded-2xl bg-card shadow-sm p-6">
            <h2 className="font-display text-xl font-bold">{s.title}</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground list-disc pl-5">
              {s.body.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </section>
        ))}
        <section id="analytics" className="rounded-2xl bg-card shadow-sm p-6">
          <h2 className="font-display text-xl font-bold">What we measure for organisers</h2>
          <p className="mt-2 text-sm text-muted-foreground">Organiser analytics are built only from the totals and grouped insights below. Organisers never receive names, email addresses, exact ages, birthdays, postcodes or individual activity, any group under 10 people is hidden, and we don&apos;t sell personal information. More detail is in our <Link href="/privacy#audience" className="underline underline-offset-2">privacy policy</Link>.</p>
          <dl className="mt-4 space-y-3 text-sm">
            {ANALYTICS_DATA.map((a) => (
              <div key={a.metric}><dt className="font-semibold">{a.metric}</dt><dd className="text-muted-foreground">{a.detail}</dd></div>
            ))}
          </dl>
        </section>
      </div>
      <p className="mt-10 text-xs text-muted-foreground">See also our <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link> and <Link href="/disclaimer" className="underline underline-offset-2">disclaimer</Link>.</p>
    </main>
  )
}
