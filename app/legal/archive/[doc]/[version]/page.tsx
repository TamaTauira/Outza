import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { PageShell } from '@/components/page-shell'
import { LEGAL_ARCHIVE } from '@/lib/legal-docs'
import { PREVIOUS_LEGAL } from '@/lib/legal-previous'

type Props = { params: Promise<{ doc: string; version: string }> }

export function generateStaticParams() {
  return LEGAL_ARCHIVE.map((item) => ({ doc: item.id, version: item.version }))
}

export async function generateMetadata({ params }: Props) {
  const { doc, version } = await params
  const text = PREVIOUS_LEGAL[`${doc}/${version}`]
  return { title: text ? `${text.title} (${version}) — VibePeep` : 'Legal archive — VibePeep' }
}

export default async function ArchivedLegalPage({ params }: Props) {
  const { doc, version } = await params
  const text = PREVIOUS_LEGAL[`${doc}/${version}`]
  const meta = LEGAL_ARCHIVE.find((item) => item.id === doc && item.version === version)
  if (!text || !meta) notFound()
  return (
    <PageShell>
      <main className="vp-wrap vp-page-top px-4 pb-12 sm:px-6">
        <BackToEventsLink className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="w-4 h-4" />Back to events
        </BackToEventsLink>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Archive · not the current version</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2">{text.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Version {meta.version}. {meta.updated}.</p>
        <p className="mt-4 text-muted-foreground leading-relaxed">{text.intro}</p>
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {text.sections.map((s) => (
            <section key={s.title} className="rounded-xl bg-card p-6 shadow-sm">
              <h2 className="font-display text-lg font-semibold">{s.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {s.body.map((p) => <p key={p}>{p}</p>)}
              </div>
            </section>
          ))}
        </div>
      </main>
    </PageShell>
  )
}
