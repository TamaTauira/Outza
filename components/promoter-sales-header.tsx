import { SiteHeader } from '@/components/site-header'

/** Sales links on the shared header. Consumer navigation stays on the event pages. */
export function PromoterSalesHeader({ accountHref }: { accountHref: string }) {
  return <SiteHeader variant="marketing" accountHref={accountHref} />
}
