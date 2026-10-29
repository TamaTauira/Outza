import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { PageShell } from '@/components/page-shell'

export const metadata = {
  title: 'Disclaimer — VibePeep',
  description: 'Why VibePeep exists, what it is (and isn’t), and the limits of our responsibility.',
}

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. Why this site exists',
    body: [
      'VibePeep was born out of a simple need: there was no easy, single place to see what’s on, sorted by when it starts. This website exists purely to help people find events more easily. It is an independent, non-official listings guide and discovery tool.',
      'VibePeep does not organise, host, run, promote (other than through clearly labelled paid placements), sell tickets for, or have any control over the events shown on this website.',
    ],
  },
  {
    title: '2. Information only — no warranty',
    body: [
      'All content on this website, including event names, dates, times, venues, prices, descriptions, images, availability and maps, is provided for general information only, on an “as is” and “as available” basis.',
      'Much of this information is gathered automatically from third-party sources (such as ticketing platforms, promoters and public event guides) and may be incomplete, out of date, inaccurate, duplicated or changed without notice. Events may be rescheduled, relocated, sold out or cancelled at any time.',
      'To the maximum extent permitted by law, we make no representations or warranties of any kind, express or implied, about the accuracy, reliability, completeness, suitability, safety or availability of any event or information on this website. You must always confirm details directly with the event organiser, venue or official ticket seller before making plans, travelling or purchasing anything.',
    ],
  },
  {
    title: '3. Third-party websites, tickets and events',
    body: [
      'This website contains links to websites, ticketing services and content owned and operated by third parties. These links are provided for convenience only. We do not endorse, control or accept responsibility for any third-party website, product, service, ticket, price, refund policy or event.',
      'Any purchase, booking, registration or other dealing you make with a third party is solely between you and that third party, on their terms. Any complaint, refund request or dispute must be directed to the relevant organiser, venue or ticket seller.',
      'Attendance at any event is entirely at your own risk and your own decision. We are not responsible for the conduct of any organiser, venue, performer, attendee or other person, or for the safety, quality, legality or content of any event.',
    ],
  },
  {
    title: '4. Promoter and user content',
    body: [
      'Promoters may submit events and purchase featured placements. Promoters are solely responsible for the accuracy and lawfulness of the content they provide. Featured or promoted listings are paid advertisements and are not a recommendation or endorsement by us.',
      'Suggestions, social features (such as seeing where friends are going) and any other user-provided content reflect the views of those users only. We may edit or remove any content at our discretion but are under no obligation to monitor it.',
    ],
  },
  {
    title: '5. Limitation of liability',
    body: [
      'To the maximum extent permitted by law, VibePeep and its owner, operators, contributors and anyone involved in creating or running this website (including in their personal capacity) will not be liable to you or anyone else for any loss, damage, cost, injury or expense of any kind — whether direct, indirect, incidental, special, consequential or otherwise, and including loss of money, tickets, travel or accommodation costs, time, data, opportunity or enjoyment — arising out of or in connection with your use of, or reliance on, this website, any information on it, any linked third-party website, or any event listed.',
      'This applies however the loss arises, whether in contract, tort (including negligence), statute or otherwise, and even if we were advised of the possibility of that loss.',
      'Where liability cannot lawfully be excluded but can be limited, our total liability is limited, at our option, to resupplying the relevant service or paying the cost of having it resupplied. For paid promoter placements, our liability is limited to a refund of the fee paid for the affected placement.',
    ],
  },
  {
    title: '6. Australian Consumer Law',
    body: [
      'Nothing in this disclaimer excludes, restricts or modifies any consumer guarantee, right or remedy you may have under the Australian Consumer Law (Schedule 2 to the Competition and Consumer Act 2010 (Cth)) or any other law that cannot lawfully be excluded, restricted or modified.',
    ],
  },
  {
    title: '7. Your responsibility and indemnity',
    body: [
      'By using this website you agree that you use it at your own risk and that you are responsible for checking any information before relying on it. To the extent permitted by law, you agree to indemnify VibePeep and its owner and operators against any claim, loss or cost arising from your misuse of the website, any content you submit, or your breach of this disclaimer.',
    ],
  },
  {
    title: '8. Availability and changes',
    body: [
      'We may change, suspend or discontinue any part of this website at any time without notice, and we do not guarantee that it will be uninterrupted, secure or free from errors, viruses or other harmful components. We may update this disclaimer at any time; continued use of the website after changes means you accept the updated version.',
    ],
  },
  {
    title: '9. Trademarks and content',
    body: [
      'Event names, artist names, venue names, logos and images belong to their respective owners and are shown only to identify the events listed. Their display does not imply any affiliation with, or endorsement by, those owners. If you believe content on this site should be removed, please contact us through the suggestions feature and we will review it promptly.',
    ],
  },
  {
    title: '10. Governing law',
    body: [
      'This disclaimer is governed by the laws of New South Wales, Australia, and you submit to the non-exclusive jurisdiction of the courts of New South Wales and the courts that may hear appeals from them.',
    ],
  },
]

export default function DisclaimerPage() {
  return (
    <PageShell>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <BackToEventsLink className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="w-4 h-4" />Back to events
        </BackToEventsLink>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Legal</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2">Disclaimer</h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          Please read this disclaimer carefully. By accessing or using VibePeep you acknowledge that you have read, understood and agree to it. If you do not agree, please do not use this website.
        </p>
        <div className="mt-10 space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.title} className="rounded-xl bg-card p-6 shadow-sm">
              <h2 className="font-display text-lg font-semibold">{s.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {s.body.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </section>
          ))}
        </div>
      </main>
    </PageShell>
  )
}
