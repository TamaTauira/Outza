import type { Metadata } from 'next'
import { InfoPage } from '@/components/info-page'

export const metadata: Metadata = {
  title: 'Contact — VibePeep',
  description: 'Need a hand with a listing, a purchase or your account? Here’s how to reach VibePeep.',
}

export default function ContactPage() {
  return (
    <InfoPage
      title="Get in touch"
      lede="Email the address on your invoice, or the one in the footer of any VibePeep email. Fastest fix for a wrong listing: Report a problem on that event."
      sections={[
        { title: 'A listing looks wrong', body: ['Open the event and use Report a problem. That is the fastest way to flag a wrong date, a duplicate, or a cancellation.'] },
        { title: 'A purchase or invoice', body: ['Open Pro & billing in the promoter dashboard and open the invoice. Include the invoice number when you write. Test-mode purchases are not card charges.'] },
        { title: 'Your account', body: ['Password changes and closing an account are on My account. Closing an account does not by itself refund a campaign.'] },
      ]}
    />
  )
}
