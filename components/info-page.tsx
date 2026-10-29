import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Footer } from '@/components/footer'
import { BackToEventsLink } from '@/components/back-to-events-link'

export function InfoPage({ title, lede, sections }: { title: string; lede: string; sections: { title: string; body: string[] }[] }) {
  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <BackToEventsLink className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to events</BackToEventsLink>
        <h1 className="mt-6 font-display text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-3 text-muted-foreground">{lede}</p>
        <div className="mt-8 space-y-8">
          {sections.map((s) => (
            <section key={s.title}>
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
      </main>
      <Footer lastRefresh={null} />
    </div>
  )
}
