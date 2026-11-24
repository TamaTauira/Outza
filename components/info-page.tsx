import type { ReactNode } from 'react'
import Link from 'next/link'
import { Page } from '@/components/layout/page'
import { PageHeader } from '@/components/layout/page-header'
import { PageShell } from '@/components/page-shell'
import { Surface } from '@/components/ui/surface'

function slug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function InfoPage({
  title,
  lede,
  sections,
  variant = 'prose',
  extra,
}: {
  title: string
  lede: string
  sections: { title: string; body: string[] }[]
  variant?: 'prose' | 'faq'
  extra?: ReactNode
}) {
  return (
    <PageShell>
      <main>
      <Page className="pb-10 lg:grid lg:grid-cols-[minmax(0,42rem)_minmax(16rem,1fr)] lg:items-start lg:gap-10 xl:gap-16">
        <div className="min-w-0">
          <PageHeader title={title} lede={lede} />
          {extra}
          <div className={variant === 'faq' ? 'mt-section divide-y divide-border border-y border-border' : 'mt-section space-y-8'}>
            {sections.map((s) => variant === 'faq' ? (
              <details key={s.title} id={slug(s.title)} name="faq" className="group scroll-mt-24 py-1">
                <summary className="cursor-pointer list-none py-3 font-display text-h3 [&::-webkit-details-marker]:hidden">{s.title}</summary>
                {s.body.map((p) => <p key={p} className="pb-3 text-sm leading-relaxed text-muted-foreground">{p}</p>)}
              </details>
            ) : (
              <section key={s.title} id={slug(s.title)} className="scroll-mt-24">
                <h2 className="font-display text-h3">{s.title}</h2>
                {s.body.map((p) => <p key={p} className="mt-2 text-sm leading-relaxed text-muted-foreground">{p}</p>)}
              </section>
            ))}
          </div>
          <p className="mt-section text-sm lg:hidden">
            <Link href="/contact" className="text-primary underline">Contact</Link>
            <span className="text-muted-foreground"> · </span>
            <Link href="/faq" className="text-primary underline">FAQ</Link>
            <span className="text-muted-foreground"> · </span>
            <Link href="/pricing" className="text-primary underline">Pricing</Link>
            <span className="text-muted-foreground"> · </span>
            <Link href="/refunds" className="text-primary underline">Refunds</Link>
          </p>
        </div>
        <aside className="mt-section hidden lg:block">
          <Surface pad="lg" className="sticky top-24 text-sm" aria-label="On this page">
            <p className="vp-eyebrow text-muted-foreground">On this page</p>
            <ul className="mt-3 space-y-2 xl:columns-2 xl:gap-x-8">
              {sections.map((s) => (
                <li key={s.title} className="break-inside-avoid"><a href={`#${slug(s.title)}`} className="text-muted-foreground hover:text-foreground">{s.title}</a></li>
              ))}
            </ul>
            <p className="vp-eyebrow mt-6 text-muted-foreground">Also</p>
            <ul className="mt-3 space-y-2">
              <li><Link href="/contact" className="text-muted-foreground hover:text-foreground">Contact</Link></li>
              <li><Link href="/faq" className="text-muted-foreground hover:text-foreground">FAQ</Link></li>
              <li><Link href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link></li>
              <li><Link href="/refunds" className="text-muted-foreground hover:text-foreground">Refunds</Link></li>
            </ul>
          </Surface>
        </aside>
      </Page>
      </main>
    </PageShell>
  )
}
