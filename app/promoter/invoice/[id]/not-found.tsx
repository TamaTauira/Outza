import Link from 'next/link'
import { PromoterAppShell } from '@/components/promoter-shell'

export default function InvoiceNotFound() {
  return (
    <PromoterAppShell>
      <main className="vp-wrap vp-page-top px-4 pb-16 sm:px-6">
        <p className="text-xs font-semibold text-primary">Billing</p>
        <h1 className="mt-1 font-display text-h1">Invoice not found</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">That invoice isn’t on this account. Open Billing to see the ones that are.</p>
        <Link href="/promoter?tab=billing" className="mt-6 inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Back to Billing</Link>
      </main>
    </PromoterAppShell>
  )
}
