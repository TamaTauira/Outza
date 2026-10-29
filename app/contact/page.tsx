import type { Metadata } from 'next'
import { InfoPage } from '@/components/info-page'

export const metadata: Metadata = {
  title: 'Contact — VibePeep',
  description: 'How to reach VibePeep about a listing, a purchase or your account.',
}

export default function ContactPage() {
  return (
    <InfoPage
      title="Contact"
      lede="Write to the address on your invoice or the address in the footer of a VibePeep email. We read listing corrections from the “Something not right?” link on each event."
      sections={[
        { title: 'A listing looks wrong', body: ['Open the event and use Something not right? Tell us. That is the fastest way to flag a wrong date, a duplicate, or a cancellation.'] },
        { title: 'A purchase or invoice', body: ['Open Pro & billing in the promoter dashboard and open the invoice. Include the invoice number when you write. Test-mode purchases are not card charges.'] },
        { title: 'Your account', body: ['Password changes and closing an account are on My account. Closing an account does not by itself refund a campaign.'] },
      ]}
    />
  )
}
