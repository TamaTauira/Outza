import Link from 'next/link'
import { PageShell } from '@/components/page-shell'

function slug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function InfoPage({
  title,
  lede,
  sections,
  variant = 'prose',
}: {
  title: string
  lede: string
  sections: { title: string; body: string[] }[]
  variant?: 'prose' | 'faq'
}) {
  return (
    <PageShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:grid lg:grid-cols-[minmax(0,42rem)_14rem] lg:gap-12">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-muted-foreground">{lede}</p>
          <div className={variant === 'faq' ? 'mt-8 divide-y divide-border border-y border-border' : 'mt-8 space-y-8'}>
            {sections.map((s) => variant === 'faq' ? (
              <details key={s.title} id={slug(s.title)} className="group scroll-mt-24 py-1">
                <summary className="cursor-pointer list-none py-3 font-semibold [&::-webkit-details-marker]:hidden">{s.title}</summary>
                {s.body.map((p) => <p key={p} className="pb-3 text-sm leading-relaxed text-muted-foreground">{p}</p>)}
              </details>
            ) : (
              <section key={s.title} id={slug(s.title)} className="scroll-mt-24">
                <h2 className="font-semibold">{s.title}</h2>
                {s.body.map((p) => <p key={p} className="mt-2 text-sm leading-relaxed text-muted-foreground">{p}</p>)}
              </section>
            ))}
          </div>
          <p className="mt-10 text-sm">
            <Link href="/contact" className="text-primary underline">Contact</Link>
            <span className="text-muted-foreground"> · </span>
            <Link href="/faq" className="text-primary underline">FAQ</Link>
            <span className="text-muted-foreground"> · </span>
            <Link href="/pricing" className="text-primary underline">Pricing</Link>
            <span className="text-muted-foreground"> · </span>
            <Link href="/refunds" className="text-primary underline">Refunds</Link>
          </p>
        </div>
        <aside className="mt-10 hidden lg:block">
          <nav aria-label="On this page" className="sticky top-24 text-sm">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">On this page</p>
            <ul className="mt-3 space-y-2">
              {sections.map((s) => (
                <li key={s.title}><a href={`#${slug(s.title)}`} className="text-muted-foreground hover:text-foreground">{s.title}</a></li>
              ))}
            </ul>
          </nav>
        </aside>
      </main>
    </PageShell>
  )
}
