import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { PageShell } from '@/components/page-shell'

export const metadata = {
  title: 'Terms of use — VibePeep',
  description: 'The terms for using VibePeep accounts, listings and the events board.',
}

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. Using VibePeep',
    body: [
      'VibePeep is an independent events guide. These terms cover the website, accounts, saved events, itineraries and community listings. Our disclaimer explains the limits of the listings themselves, and our privacy policy explains what we collect.',
      'By creating an account or continuing to use VibePeep you agree to these terms, the disclaimer and the privacy policy. If you do not agree, please don’t use the site.',
    ],
  },
  {
    title: '2. Accounts',
    body: [
      'You need to be 13 or older to create an event-goer account. We ask for the year you were born, not the full date, and we treat you as the youngest age that year allows. In the EU, the EEA and the UK we do not open accounts when that age is under 16. That country check uses the network’s country and can be wrong or missing.',
      'If you might still be under 18, you can use VibePeep, but you are left out of organiser audience insights and we do not use your vibe answers or browsing to profile or rank a newsletter for you.',
      'Keep your password to yourself. You are responsible for activity under your account.',
      'Saved favourites belong to the account that saved them. Signing out, or using a different account, does not show someone else’s saves. An itinerary is stored on the device for the account that is signed in, and is cleared from view when you sign out.',
      'We may suspend an account that is used to break the law, harass people, or interfere with the site.',
    ],
  },
  {
    title: '3. Listings and your content',
    body: [
      'Most events are gathered from public sources. Times, prices and availability change. Always confirm with the organiser or ticket seller before you go. VibePeep does not sell tickets.',
      'If you list something on VibePeep Local, or submit an event as a promoter, you confirm you have the right to share that information and that it is accurate to the best of your knowledge. We may edit, refuse or remove a listing.',
      'Paid placements are advertisements. They are labelled, and they are not a recommendation from us.',
    ],
  },
  {
    title: '4. Acceptable use',
    body: [
      'Don’t misuse the site. That includes trying to break into accounts, scraping in a way that degrades the service, posting unlawful or misleading content, or using VibePeep to spam people.',
      'Event names, images and venue names belong to their owners. They are shown so you can recognise the event.',
    ],
  },
  {
    title: '5. Liability',
    body: [
      'To the extent the law allows, VibePeep is not liable for decisions you make from a listing, for a third-party ticket purchase, or for loss caused by information that is incomplete or out of date. Nothing in these terms limits rights you have under the Australian Consumer Law that cannot be excluded.',
    ],
  },
  {
    title: '6. Changes and contact',
    body: [
      'We may update these terms as the product changes. The page you are reading is the current version. Questions can go through the suggestions link on the site.',
      'These terms are governed by the laws of New South Wales, Australia.',
    ],
  },
]

export default function TermsPage() {
  return (
    <PageShell>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <BackToEventsLink className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="w-4 h-4" />Back to events
        </BackToEventsLink>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Legal</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2">Terms of use</h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          The short version: VibePeep helps you find what’s on. Accounts and saves are yours. Listings are information, not a promise. Read the <Link href="/disclaimer" className="underline underline-offset-2 hover:text-foreground">disclaimer</Link> and <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">privacy policy</Link> as well.
        </p>
        <div className="mt-10 space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.title} className="rounded-xl bg-card p-6 shadow-sm">
              <h2 className="font-display text-lg font-semibold">{s.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {s.body.map((p) => <p key={p}>{p}</p>)}
              </div>
            </section>
          ))}
        </div>
      </main>
    </PageShell>
  )
}
