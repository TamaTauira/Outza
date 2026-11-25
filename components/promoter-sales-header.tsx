import Link from 'next/link'
import { SiteHeaderBrand, SiteHeaderFrame } from '@/components/site-header-bar'
import { Button } from '@/components/ui/button'
import { COPY } from '@/lib/copy'

/** Sales links on the shared header bar. Consumer navigation stays on the event pages. */
export function PromoterSalesHeader({ accountHref }: { accountHref: string }) {
  return (
    <SiteHeaderFrame grow>
      <SiteHeaderBrand />
      <p className="hidden shrink-0 text-sm font-semibold sm:block">for Promoters</p>
      <nav className="flex min-w-0 basis-full flex-wrap items-center justify-end gap-x-3 gap-y-2 text-sm sm:basis-auto sm:flex-1" aria-label="Promoters">
        <Link href="/promoters#packages" className="hidden whitespace-nowrap font-medium text-muted-foreground hover:text-foreground sm:inline">Pricing</Link>
        <Link href="/promoters#faq" className="hidden whitespace-nowrap font-medium text-muted-foreground hover:text-foreground md:inline">FAQ</Link>
        <Link href="/local-ads" className="whitespace-nowrap font-medium text-muted-foreground hover:text-foreground">Local business ads</Link>
        <Link href="/" className="hidden whitespace-nowrap font-medium text-muted-foreground hover:text-foreground lg:inline">Back to events</Link>
        <Link href="/login?next=/promoter" className="whitespace-nowrap font-medium text-muted-foreground hover:text-foreground">{COPY.signIn}</Link>
        <Button asChild size="sm"><Link href={accountHref}>Create free account</Link></Button>
      </nav>
    </SiteHeaderFrame>
  )
}
