import Link from 'next/link'
import { VibePeepLogo } from '@/components/vibepeep-logo'
import { Button } from '@/components/ui/button'
import { COPY } from '@/lib/copy'

/** Sales header for promoters. Consumer navigation stays on the event pages. */
export function PromoterSalesHeader({ accountHref }: { accountHref: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="vp-wrap flex h-16 items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="VibePeep home">
          <VibePeepLogo size="sm" />
        </Link>
        <p className="hidden text-sm font-semibold sm:block">for Promoters</p>
        <nav className="ml-auto flex items-center gap-3 text-sm" aria-label="Promoters">
          <Link href="/promoters#packages" className="hidden font-medium text-muted-foreground hover:text-foreground sm:inline">Pricing</Link>
          <Link href="/promoters#faq" className="hidden font-medium text-muted-foreground hover:text-foreground md:inline">FAQ</Link>
          <Link href="/local-ads" className="font-medium text-muted-foreground hover:text-foreground">Local business ads</Link>
          <Link href="/" className="hidden font-medium text-muted-foreground hover:text-foreground lg:inline">Back to events</Link>
          <Link href="/login?next=/promoter" className="font-medium text-muted-foreground hover:text-foreground">{COPY.signIn}</Link>
          <Button asChild size="sm"><Link href={accountHref}>Create free account</Link></Button>
        </nav>
      </div>
    </header>
  )
}
