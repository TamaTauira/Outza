import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { LegalStamp } from '@/components/legal-stamp'
import { PageShell } from '@/components/page-shell'
import { LEGAL_DOCS } from '@/lib/legal-docs'

export const metadata = {
  title: 'Promoter & Advertising Terms — VibePeep',
  description: 'Draft terms for listings, sponsored placements and promoter subscriptions on VibePeep.',
}

const ABN = process.env.BUSINESS_ABN?.trim() || ''

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. Who these terms are for',
    body: [
      'These terms are between you and Outza, which runs VibePeep, an events guide based in Australia. They cover promoter accounts, listings you submit, paid placements and subscriptions. The general terms of use, disclaimer and privacy policy still apply. If they conflict on a promoter or advertising point, these terms win.',
      'This page is a draft for a lawyer to review. It is written in plain English so a promoter can see the deal. It is not a substitute for advice on your own campaign.',
    ],
  },
  {
    title: '2. What you can buy',
    body: [
      'You can list events, and you can pay to feature them. Spotlight, Boost and Headliner are paid placements. They are one-off purchases, not monthly plans, and they are labelled Sponsored.',
      'Local Pro, Growth and Venue Plus are monthly subscriptions. A new subscription can start with a 30-day trial. The trial is only on those monthly plans. Spotlight, Boost, Headliner and the 30-day Promoter Pro pass are paid up front and do not include that trial.',
      'A trial becomes a paid subscription when it ends, unless you cancel before then. We tell you that before you start the trial.',
    ],
  },
  {
    title: '3. Where a placement appears',
    body: [
      'Paying for a placement does not guarantee a rank, a position on the page, a number of views, or a sale. We choose the layout. A paid card is labelled Sponsored (or Featured, where that label is already used) so a reader can tell it from an ordinary listing.',
      'We may move, pause or stop showing a placement that breaks these terms, breaks the law, or is inaccurate. We may also refuse a listing before it goes up.',
    ],
  },
  {
    title: '4. Your content',
    body: [
      'You confirm that the event details you give us are accurate, that you have the rights to the words and images, and that the listing is not unlawful, misleading or unsuitable for the audience you describe. That includes the Australian Consumer Law: do not claim a price, a date or an inclusion you cannot stand behind.',
      'You keep ownership of your content. You give Outza a licence to host, show and adapt it as needed to run the listing and the placement (for example, cropping an image for a card).',
    ],
  },
  {
    title: '5. If we take something down',
    body: [
      'We may remove a listing or a placement. If we remove it for a reason that is not your breach, we refund the unused part of any fee you have already paid for that item, pro rata for the days that were left.',
      'If we remove it because the content was misleading, unlawful, or otherwise a breach by you, the fee for the period already used is not refunded under this clause. Consumer guarantees that cannot be excluded still apply.',
    ],
  },
  {
    title: '6. Paying',
    body: [
      'Payments are taken by Stripe. Card details go to Stripe, not to our database. Monthly plans renew automatically each billing cycle until you cancel. Cancel before the renewal if you do not want the next period.',
      'A 30-day trial on Local Pro, Growth or Venue Plus converts to a paid period at the price shown when you started, unless you cancel during the trial. One-off placements and Promoter Pro are charged when you check out.',
    ],
  },
  {
    title: '7. GST and invoices',
    body: [
      'Promoter prices on VibePeep are in Australian dollars and include GST unless a price on the page says it is exclusive. That matches the checkout summary, which states that the total is GST inclusive.',
      ABN
        ? `Our ABN is ${ABN}. Stripe issues the tax invoice for a successful payment.`
        : 'Our ABN is printed on tax invoices. It is read from the BUSINESS_ABN setting on the host and is not hardcoded in this page. Stripe issues the tax invoice for a successful payment.',
    ],
  },
  {
    title: '8. Refunds',
    body: [
      'Nothing in these terms takes away a guarantee, right or remedy under the Australian Consumer Law that cannot be excluded. Where a guarantee applies, we will provide the remedy the law requires.',
      'Outside those guarantees, refunds follow the clauses above: unused prepaid time when we end a service without your breach, and when you reject a change under clause 10. A product page may offer an extra window, such as a refund of an unshown boost. That extra window does not limit the Consumer Law.',
    ],
  },
  {
    title: '9. Liability and indemnity',
    body: [
      'To the extent the law allows, each side’s liability to the other for a claim about these terms is limited to the fees you paid Outza for the affected service in the 12 months before the claim. This limit does not apply to liability that cannot legally be limited, including a breach of a consumer guarantee that cannot be excluded, or to liability for fraud.',
      'Each side indemnifies the other against claims by a third party that arise from that side’s own content or that side’s own breach of these terms. The indemnity is reduced to the extent the other side caused or contributed to the loss. It is not an open-ended promise to cover every claim connected with VibePeep.',
    ],
  },
  {
    title: '10. Changes, ending the deal',
    body: [
      'We may change these terms. We will email the address on the promoter account at least 14 days before a change takes effect. If you reject the change, you may cancel before it starts and we will refund, pro rata, the prepaid fees for the unused period.',
      'You may stop using the promoter tools and cancel a subscription at any time. Cancellation stops the next renewal. We may end your promoter access if you breach these terms and do not fix it within a reasonable time after we tell you, or immediately if the breach is serious (for example, unlawful or misleading advertising).',
      'When the deal ends, live placements stop. Fees already earned for time that has run stay with us, except where clause 5, clause 8 or the Consumer Law requires a refund.',
      'These terms are governed by the laws of New South Wales, Australia.',
    ],
  },
]

export default function PromoterTermsPage() {
  return (
    <PageShell>
      <main className="vp-wrap px-4 py-12 sm:px-6">
        <BackToEventsLink className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="w-4 h-4" />Back to events
        </BackToEventsLink>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Legal · draft for lawyer review</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2">Promoter &amp; Advertising Terms</h1>
        <LegalStamp doc="promoter" />
        <p className="mt-4 rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm leading-relaxed">
          Draft for lawyer review. This is the working text for promoters and advertisers. It is not a finished legal opinion.
        </p>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          Also read the <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">terms of use</Link>, <Link href="/disclaimer" className="underline underline-offset-2 hover:text-foreground">disclaimer</Link> and <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">privacy policy</Link>. Version {LEGAL_DOCS.promoter.version}.
        </p>
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
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
