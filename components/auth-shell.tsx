import Link from 'next/link'
import { VibePeepLogo } from '@/components/vibepeep-logo'
import { BRAND_SUBLINE, BRAND_TAGLINE } from '@/lib/brand'

const ASIDE_LINKS = [
  { href: '/', label: 'Peep' },
  { href: '/map', label: 'Map' },
  { href: '/local', label: 'Local' },
  { href: '/promoters', label: 'For promoters' },
]

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 lg:block lg:px-0">
      <div className="w-full max-w-md lg:mx-auto lg:grid lg:min-h-[calc(100vh-6rem)] lg:w-full lg:max-w-none lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center lg:gap-16 vp-wrap lg:px-6 xl:gap-24">
        <div className="mb-8 lg:mb-0">
          <Link href="/" className="flex justify-center lg:justify-start" aria-label="VibePeep home">
            <VibePeepLogo size="md" />
          </Link>
          <div className="mt-8 hidden max-w-md lg:block">
            <p className="font-display text-4xl font-bold tracking-tight">{BRAND_TAGLINE}</p>
            <p className="mt-3 text-muted-foreground">{BRAND_SUBLINE}</p>
            <ul className="mt-8 grid grid-cols-2 gap-3 text-sm">
              {ASIDE_LINKS.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="block rounded-xl border border-border bg-card px-4 py-3 font-semibold hover:bg-muted">{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div>
          <div className="rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-xl sm:p-8">
            <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">{subtitle}</p>
            {children}
          </div>
          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            We acknowledge the Traditional Custodians of the lands across Australia and pay our respects to Elders past and present.
          </p>
        </div>
      </div>
    </main>
  )
}
