import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { PageShell } from '@/components/page-shell'
import { LEGAL_ARCHIVE, LEGAL_DOCS } from '@/lib/legal-docs'

export const metadata = { title: 'Earlier legal versions — VibePeep', description: 'Previous versions of the VibePeep terms, privacy policy, disclaimer and refunds page.' }

export default function LegalArchivePage() {
  return (
    <PageShell>
      <main className="vp-wrap vp-page-top px-4 pb-12 sm:px-6">
        <BackToEventsLink className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="w-4 h-4" />Back to events
        </BackToEventsLink>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Legal</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2">Earlier versions</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
          These are the legal pages as they stood before 18 November 2026. The current versions are the ones linked from the footer.
        </p>
        <ul className="mt-8 space-y-3">
          {LEGAL_ARCHIVE.map((item) => (
            <li key={item.path}>
              <Link href={item.path} className="font-semibold underline underline-offset-2">{item.title}</Link>
              <span className="ml-2 text-sm text-muted-foreground">Version {item.version} · {item.updated}</span>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-muted-foreground">
          Current: <Link href={LEGAL_DOCS.terms.path} className="underline">terms</Link>, <Link href={LEGAL_DOCS.privacy.path} className="underline">privacy</Link>, <Link href={LEGAL_DOCS.disclaimer.path} className="underline">disclaimer</Link>, <Link href={LEGAL_DOCS.promoter.path} className="underline">promoter terms</Link>, <Link href={LEGAL_DOCS.refunds.path} className="underline">refunds</Link>.
        </p>
      </main>
    </PageShell>
  )
}
