import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { PromoterClient } from './promoter-client'
import { BecomePromoter } from './become-promoter'

export const dynamic = 'force-dynamic'

export default async function PromoterPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/promoter')
  const role = (session.user as { role?: string }).role
  if (role !== 'PROMOTER' && role !== 'ADMIN') {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold mb-2">Promoter accounts only</h1>
        <p className="text-muted-foreground mb-6">Switch your account to a promoter account to list and promote your events. You&apos;ll keep your saved events and follows.</p>
        <BecomePromoter />
      </main>
    )
  }
  return <PromoterClient stripeEnabled={!!process.env.STRIPE_SECRET_KEY} />
}
