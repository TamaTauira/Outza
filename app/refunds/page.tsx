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
      lede="Campaigns, Promoter Pro and local recommendations are one-off purchases. Buying one does not start a subscription that renews by itself."
      sections={[
        { title: 'Campaigns', body: ['A Boost, Spotlight or Headliner campaign starts when payment is confirmed and runs for the length you chose. We do not refund a campaign because it ends before the event date — the builder warns you when that will happen — or because fewer people opened the listing than you hoped. If we take payment and the campaign never goes live because of a fault on our side, write to us with the invoice number and we will refund that charge.'] },
        { title: 'Promoter Pro', body: ['Pro is a 30-day pass. Ending it from billing stops the discount and the unlocked analytics. It does not refund the days already paid. A second purchase inside a minute of the first is refused so a double click does not bill you twice.'] },
        { title: 'Local recommendations', body: ['You can cancel a live recommendation from Local business ads. Cancelling removes it from the event page. The fee is not refunded, because the spot was reserved for that event.'] },
        { title: 'Test mode', body: ['When card payments are not switched on, the dashboard says payments are in test mode and nothing is charged. Those invoices are records only.'] },
        { title: 'How to ask', body: ['Open the invoice from Pro & billing and include the invoice number. We do not refund ticket sales. Tickets are sold by the organiser or the ticket company, not by VibePeep.'] },
      ]}
    />
  )
}
