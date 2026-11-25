import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { Surface } from '@/components/ui/surface'
import { BRAND_SUBLINE, BRAND_TAGLINE } from '@/lib/brand'
import { cn } from '@/lib/utils'

const CONSUMER_LINKS = [
  { href: '/', label: 'Explore' },
  { href: '/map', label: 'Map' },
  { href: '/local', label: 'Local' },
  { href: '/saved', label: 'Saved' },
]

const PROMOTER_LINKS = [
  { href: '/promoters', label: 'Packages' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/promoters#faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
]

export function AuthShell({ title, subtitle, children, aside = 'consumer' }: { title: string; subtitle: string; children: React.ReactNode; aside?: 'consumer' | 'promoter' | 'none' }) {
  const links = aside === 'promoter' ? PROMOTER_LINKS : CONSUMER_LINKS
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader variant="auth" />
      <main className="bg-background px-4 pb-16 lg:px-0">
      <div className={cn('vp-wrap mt-6 w-full max-w-md lg:mx-auto lg:mt-10 lg:w-full lg:max-w-none lg:px-6', aside === 'none' ? '' : 'lg:grid lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start lg:gap-16 xl:gap-24')}>
        {aside !== 'none' && (
        <div className="mb-8 hidden lg:mb-0 lg:block">
          <div className="max-w-md">
            <p className="font-display text-h2">{BRAND_TAGLINE}</p>
            <p className="mt-3 text-body text-muted-foreground">{BRAND_SUBLINE}</p>
            <ul className="mt-8 grid grid-cols-2 gap-card text-sm">
              {links.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="flex min-h-11 items-center rounded-card border border-border bg-card px-4 py-3 font-semibold hover:bg-muted">{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        )}
        <div className={aside === 'none' ? 'mx-auto w-full max-w-md' : ''}>
          <Surface pad="lg" className="text-card-foreground sm:p-8">
            <h1 className="font-display text-h1">{title}</h1>
            <p className="mb-6 mt-2 text-sm text-muted-foreground">{subtitle}</p>
            {children}
          </Surface>
        </div>
      </div>
      </main>
    </div>
  )
}
