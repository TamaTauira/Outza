import type { Metadata } from 'next'
import { InfoPage } from '@/components/info-page'

export const metadata: Metadata = {
  title: 'Refunds — VibePeep',
  description: 'When a VibePeep campaign, Pro pass or local recommendation can be refunded.',
}

export default function RefundsPage() {
  return (
    <InfoPage
      title="Refunds"
      lede="Multi-day campaigns, Promoter Pro and local recommendations are one-off purchases. Monthly organiser plans renew until you cancel them. Nothing starts a trial."
      sections={[
        { title: 'Campaigns', body: ['A Boost, Spotlight or Headliner campaign starts when payment is confirmed and runs for the length you chose. We do not refund a campaign because it ends before the event date — the builder warns you when that will happen — or because fewer people opened the listing than you hoped. If we take payment and the campaign never goes live because of a fault on our side, write to us with the invoice number and we will refund that charge.'] },
        { title: 'Short boosts', body: ['An evening pass or day pass can be refunded from the dashboard when it has not been shown, within 48 hours of the start you picked (7 days on Venue Plus). Once it has been served, the self-serve refund closes. A quote request is not a charge.'] },
        { title: 'Monthly plans', body: ['Local Pro, Growth and Venue Plus charge the price you ticked, then the same amount each month until you cancel. Cancel keeps the days already paid and stops the next renewal. A refund of the current period is available from billing when the period is still inside the refund window and no short boost has been shown. Upgrades charge the difference then. Downgrades wait for the next renewal. There is no free trial.'] },
        { title: 'Promoter Pro', body: ['Pro is a 30-day pass. Ending it from billing stops the discount and the unlocked analytics. It does not refund the days already paid. A second purchase inside a minute of the first is refused so a double click does not bill you twice.'] },
        { title: 'Local recommendations', body: ['You can cancel a live recommendation from Local business ads. Cancelling removes it from the event page. The fee is not refunded, because the spot was reserved for that event.'] },
        { title: 'Test mode', body: ['When card payments are not switched on, the dashboard says payments are in test mode and nothing is charged. Those invoices are records only.'] },
        { title: 'How to ask', body: ['Open the invoice from Pro & billing and include the invoice number. We do not refund ticket sales. Tickets are sold by the organiser or the ticket company, not by VibePeep.'] },
      ]}
    />
  )
}
