import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { Surface } from '@/components/ui/surface'
import { BRAND_SUBLINE, BRAND_TAGLINE } from '@/lib/brand'

const ASIDE_LINKS = [
  { href: '/', label: 'Explore' },
  { href: '/map', label: 'Map' },
  { href: '/local', label: 'Local' },
  { href: '/promoters', label: 'For promoters' },
]

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader variant="auth" />
      <main className="flex items-center justify-center bg-background px-4 py-10 lg:block lg:px-0">
      <div className="vp-wrap w-full max-w-md lg:mx-auto lg:grid lg:min-h-[calc(100vh-8rem)] lg:w-full lg:max-w-none lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center lg:gap-16 lg:px-6 xl:gap-24">
        <div className="mb-8 hidden lg:mb-0 lg:block">
          <div className="max-w-md">
            <p className="font-display text-h2">{BRAND_TAGLINE}</p>
            <p className="mt-3 text-body text-muted-foreground">{BRAND_SUBLINE}</p>
            <ul className="mt-8 grid grid-cols-2 gap-card text-sm">
              {ASIDE_LINKS.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="block rounded-card border border-border bg-card px-4 py-3 font-semibold hover:bg-muted">{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div>
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
