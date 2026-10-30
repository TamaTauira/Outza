import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { PageShell } from '@/components/page-shell'

export const metadata = { title: 'Privacy policy — VibePeep', description: 'What VibePeep collects, why, and the choices you have.' }

const SECTIONS: { title: string; body: string[]; id?: string }[] = [
  { title: 'What we collect', body: [
    'Account details you give us: your name, email address and, if you sign in with Google, the basic profile Google shares (name, email, picture).',
    'Event-goer profile: the year you were born (required) and, if you choose to add it, your home postcode. We do not ask for or keep your full date of birth.',
    'Your preferences: home city, preferred cities and categories, and your email newsletter settings (on/off and frequency).',
    'Your vibe (optional): if you choose to answer them, your usual vibe, a one-line vibe bio, who you go out with, when you go out, typical spend, how far you travel, how you get there, how far ahead you plan and how often you go out. You can change or clear these at any time in your account.',
    'What you do on VibePeep: events you save or mark as going, and, when you’re signed in, the events you view, share, add to your itinerary or tap through to tickets. Also the promoters you follow and friend connections you create.',
    'Newsletter interactions: which links in our emails you click, and whether an email appears to have been opened (via a small image). Open data is approximate because many email apps block or pre-load images.',
    'Promoters: business details and the events and promotions you create and purchase.',
    'Reports and claims: if you report incorrect event details we store your report and, if you give it, your email so we can reply. If you claim a listing we store your organisation, role and the evidence you provide so we can check the claim.',
  ] },
  { title: 'How we use it', body: [
    'To run your account and show you events in your city.',
    'To personalise the newsletter for adults: we rank events using stated interests and vibe answers, the events you save or attend, and the newsletter links you click. If the youngest age your birth year allows is under 18, we do not use your vibe answers, browsing or clicks to profile or rank what you see.',
    'To measure and improve the newsletter (for example, which sections and subject lines get clicked), using aggregated statistics.',
    'To keep the service secure and working properly.',
  ] },
  { title: 'Organiser analytics', body: [
    'Organisers see totals for their events: page views, ticket-link clicks, saves, “going” counts, shares, itinerary adds and clicks on their sponsored placements. They never receive your name, email or individual activity. We don’t sell personal information. The full list is on How listings work.',
  ] },
  { id: 'audience', title: 'Audience insights for organisers', body: [
    'We ask event-goers for a year of birth so we can confirm you’re old enough to use VibePeep (13+). We store only that year. Age checks use the youngest age that year could be, so we never treat you as older than you might be. Your home postcode is optional.',
    'People whose birth year means they might still be under 18 are left out of organiser insights and of newsletter profiling. They can still use VibePeep, save events and follow what they choose.',
    'Organisers only ever see grouped percentages for adults who engaged with their events on VibePeep, such as age bands (for example “25–34”), broad home areas (for example “Eastern suburbs”), other event categories those people like, and how far ahead they plan. Optional vibe answers from adults (never a vibe bio) may be counted the same grouped way.',
    'They never see your year of birth, postcode, address, name or email, and they can’t see what any one person did.',
    'Any group with fewer than 10 people is hidden, and percentages are worked out only from the groups that are shown, so a small group can’t be worked out by subtraction.',
    'These insights come from saves, “going”, ticket taps, shares, itinerary adds and views on VibePeep. VibePeep doesn’t sell tickets, so this is interest data, not a list of ticket buyers.',
    'You can update your year of birth or postcode, or remove your postcode, in your account settings. If you delete your account, your profile and activity stop counting towards these insights.',
    'If our best-effort location check (the country on the connection, not a precise address) places a sign-up in the EU, the EEA or the UK, and the birth year means the person might be under 16, we decline the account. That check can miss a country when the network does not say where it is.',
  ] },
  { title: 'Email marketing', body: [
    'We only send the newsletter if you turn it on (it is off by default). Every email identifies VibePeep and includes a working one-click unsubscribe, which we action straight away, in line with the Spam Act 2003 (Cth).',
  ] },
  { title: 'Payments', body: [
    'Promotion purchases are processed by Stripe. Card details go directly to Stripe and are never stored on VibePeep; we keep only the order record (what was bought, the amount and its status). Prices are shown in Australian dollars.',
  ] },
  { title: 'Sponsored content', body: [
    'Some events and recommendations are paid placements from organisers or local businesses. They are always labelled “Sponsored” or “Featured”. We don’t share your personal details with advertisers.',
  ] },
  { title: 'Who else is involved', body: [
    'We use service providers to host the website, store data, deliver emails and generate short editorial descriptions of events. If you choose Google sign-in, Google processes that sign-in.',
    'When you click through to a ticket or organiser website, that site’s own privacy policy applies. Links from our emails carry campaign tags so organisers can see the visit came from VibePeep; they don’t include your email address.',
  ] },
  { title: 'Your choices', body: [
    'You can update your year of birth and home postcode (or remove your postcode) in your account settings.',
    'You can change your city, interests and email frequency, or turn the newsletter off, at any time in your account settings.',
    'Every newsletter includes a one-click unsubscribe link.',
    'You can remove saved events, going status and follows at any time.',
  ] },
  { title: 'Your rights under Australian privacy law', body: [
    'We aim to handle personal information in line with the Australian Privacy Principles in the Privacy Act 1988 (Cth).',
    'You can ask to access or correct the personal information we hold about you, or ask us to delete your account, using the feedback button on the site. We’ll respond within 30 days.',
    'Some of our service providers (hosting, email and payments) may store data outside Australia, for example in the United States.',
    'If you’re unhappy with how we handled a privacy concern, you can complain to the Office of the Australian Information Commissioner (oaic.gov.au).',
  ] },
]

export default function PrivacyPage() {
  return (
    <PageShell>
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <BackToEventsLink className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to events</BackToEventsLink>
      <h1 className="mt-6 font-display text-3xl sm:text-4xl font-bold tracking-tight">Privacy policy</h1>
      <p className="mt-3 text-muted-foreground">VibePeep is an independent events guide. This page explains, in plain English, what we collect and why.</p>
      <div className="mt-10 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.title} id={s.id} className="rounded-2xl bg-card shadow-sm p-6 scroll-mt-24">
            <h2 className="font-display text-xl font-bold">{s.title}</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground list-disc pl-5">
              {s.body.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-10 text-xs text-muted-foreground">See also <Link href="/how-listings-work" className="underline underline-offset-2">how listings work</Link> and our <Link href="/disclaimer" className="underline underline-offset-2">disclaimer</Link>.</p>
    </main>
    </PageShell>
  )
}
