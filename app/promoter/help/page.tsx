import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { PromoterAppShell } from '@/components/promoter-shell'
import { PAYMENTS_COPY } from '@/lib/payments-mode'
import { HelpForm } from './help-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Help', robots: { index: false, follow: false } }

export default async function PromoterHelpPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login?as=promoter&next=%2Fpromoter%2Fhelp')
  const role = (session.user as { role?: string }).role
  if (role !== 'PROMOTER' && role !== 'ADMIN') redirect('/promoter')
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } })
  if (!user?.email) redirect('/login?as=promoter&next=%2Fpromoter%2Fhelp')

  return (
    <PromoterAppShell>
      <main className="vp-wrap vp-page-top vp-stack px-4 pb-16 sm:px-6">
        <div>
          <p className="text-xs font-semibold text-primary">Promoter</p>
          <h1 className="mt-1 font-display text-h1">Help</h1>
        </div>
        <section className="max-w-2xl rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Campaigns and billing</h2>
          <p className="mt-2 text-sm text-muted-foreground">{PAYMENTS_COPY.testBanner}</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link href="/promoter?tab=billing" className="font-semibold text-primary">Billing</Link> lists campaigns, Pro and local recommendations, each with an invoice.</li>
            <li><Link href="/pricing" className="font-semibold text-primary">Pricing</Link> uses the same package prices as checkout.</li>
            <li><Link href="/refunds" className="font-semibold text-primary">Refunds</Link> covers the Australian Consumer Law and the extra cases.</li>
            <li><Link href="/terms/promoters" className="font-semibold text-primary">Promoter terms</Link> are the ones you tick before a campaign.</li>
          </ul>
        </section>
        <div className="max-w-2xl">
          <HelpForm email={user.email} />
        </div>
      </main>
    </PromoterAppShell>
  )
}
