import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { LegalStamp } from '@/components/legal-stamp'

export const metadata: Metadata = {
  title: 'Refunds — VibePeep',
  description: 'When a VibePeep placement, plan or Promoter Pro pass can be refunded, and how to ask.',
}

const ACL = 'Nothing in this policy limits your rights under the Australian Consumer Law, including your right to a refund or other remedy for a major failure.'

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Your rights',
    body: [
      ACL,
      'Where a consumer guarantee applies, we provide the remedy the law requires. The rest of this page describes what we do in addition to those rights. It does not replace them.',
    ],
  },
  {
    title: 'If we remove a listing or placement',
    body: [
      'If VibePeep removes a listing or a paid placement, and the reason is not a breach by you, we refund the unused part of the fee you already paid for that item. The refund is pro rata for the days that were left.',
      'If we remove it because the content was misleading, unlawful, or otherwise your breach, this clause does not refund the days already used. The Australian Consumer Law still applies.',
    ],
  },
  {
    title: 'If the event is cancelled',
    body: [
      'If the event is cancelled, a paid promotion for that event stops. The unused part of that placement is refunded or credited. Where it is practical, you choose the refund or the credit.',
      'Days that had already run before the cancellation are not refunded under this clause. A guarantee that cannot be excluded still applies.',
    ],
  },
  {
    title: 'If a placement does not appear as described',
    body: [
      'If a placement does not appear as described, we refund that fee or make it good. Examples are a Spotlight that is not shown, or a placement that runs on the wrong dates or in the wrong area.',
      'To claim, open the contact page and include the invoice number, the event, and what was wrong (it did not show, or the dates or area were wrong). We reply with a refund or a make-good. A make-good is a replacement placement for the unused time, or the difference if only part of it was wrong.',
    ],
  },
  {
    title: 'Campaigns that run as described',
    body: [
      'A Boost, Spotlight or Headliner campaign starts when payment is confirmed and runs for the length you chose. Choosing a length that ends before the event date, or receiving fewer opens than you hoped, does not by itself refund days that ran as described. The builder warns you when a campaign will end before the event.',
      'If the campaign never goes live because of a fault on our side, that is a placement that did not appear as described, and the fee is refunded.',
    ],
  },
  {
    title: 'Short boosts',
    body: [
      'An evening pass or day pass that has not been shown can be refunded from the dashboard within 48 hours of the start you picked (7 days on Venue Plus). That button is an extra window. It is not the only way to ask.',
      'Once a boost has been shown, the self-serve button closes. Write to us if we removed it, the event was cancelled, or it did not appear as described. A quote request is not a charge.',
    ],
  },
  {
    title: 'Monthly plans',
    body: [
      'Local Pro, Growth and Venue Plus can start with one free month (30 days unless TRIAL_PERIOD_DAYS says otherwise). The card is charged when that month ends, then the same amount each month until you cancel. Cancel during the free month and you are not charged. One free month per account and per organisation.',
      'A paid period can also be refunded from billing when it is still inside the plan’s refund window and no short boost has been shown. Upgrades charge the difference then. Downgrades wait for the next renewal. Removing the service for a reason other than your breach refunds the unused part of the period you already paid.',
    ],
  },
  {
    title: 'Promoter Pro',
    body: [
      'Pro is a 30-day pass. Ending it yourself stops the discount and the unlocked analytics. Days already used are not automatically refunded. The removal, cancellation and “not as described” rules above still apply, as does the Australian Consumer Law.',
      'A second purchase inside a minute of the first is refused so a double click does not bill you twice.',
    ],
  },
  {
    title: 'Local recommendations',
    body: [
      'You can cancel a live recommendation from Local business ads. Cancelling it yourself takes it off the event page. That does not automatically refund a spot that ran.',
      'If we remove it for a reason other than your breach, the event is cancelled, or the recommendation did not appear as described, the unused fee is refunded or made good on the same rules as other placements.',
    ],
  },
  {
    title: 'How a refund is paid',
    body: [
      'An approved refund is paid back to the original payment method through Stripe within 5 to 10 business days of approval. Your bank may take further days to show it on the card.',
      'Where you chose a credit and it is practical, we apply the credit to a later VibePeep placement instead of sending it back to the card.',
    ],
  },
  {
    title: 'How to ask',
    body: [
      'Open the invoice from Pro & billing and write via the contact page. Include the invoice number, the event, and which case applies: we removed it, the event was cancelled, or it did not appear as described.',
      'We do not sell tickets. A ticket refund is between you and the organiser or the ticket company.',
    ],
  },
  {
    title: 'Test mode',
    body: [
      'When card payments are not switched on, the dashboard says payments are in test mode and nothing is charged. Those invoices are records only.',
      'A self-serve refund button talks to Stripe only with a test secret. It does not send a live refund. A live charge is handled from the contact page, not by that button.',
    ],
  },
]

export default function RefundsPage() {
  return (
    <PageShell>
      <main className="vp-wrap px-4 py-12 sm:px-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Legal</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2">Refunds</h1>
        <LegalStamp doc="refunds" />
        <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
          Multi-day campaigns, Promoter Pro and local recommendations are one-off purchases. A monthly organiser plan can start with one free month, then renews until you cancel. The same rules are in the <Link href="/terms/promoters" className="underline underline-offset-2 hover:text-foreground">Promoter &amp; Advertising Terms</Link>.
        </p>
        <p className="mt-4 max-w-2xl rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm leading-relaxed">{ACL}</p>
        <div className="mt-10 max-w-2xl space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="font-semibold">{section.title}</h2>
              {section.body.map((paragraph) => <p key={paragraph} className="mt-2 text-sm leading-relaxed text-muted-foreground">{paragraph}</p>)}
            </section>
          ))}
        </div>
      </main>
    </PageShell>
  )
}
