import Link from 'next/link'
import { prisma } from '@/lib/db'
import { catalogueSpecs, renderTemplate, type TemplateId } from '@/lib/email-catalogue'
import { configuredTestInbox } from '@/lib/email-test-inbox'
import { SendTest } from './send-test'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Emails', robots: { index: false, follow: false }, openGraph: { title: 'Emails · VibePeep' } }

function when(value: Date) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(value)
}

export default async function AdminEmailsPage({ searchParams }: { searchParams: Promise<{ id?: string; width?: string }> }) {
  const params = await searchParams
  const specs = catalogueSpecs().map(({ subjectOf: _s, paragraphsOf: _p, ctaOf: _c, bulletsOf: _b, composer: _o, ...entry }) => entry)
  const selected = specs.find((row) => row.id === params.id) ?? specs.find((row) => row.id === 'C2') ?? specs[0]
  const width = params.width === '375' ? 375 : 600
  const mail = renderTemplate(selected.id as TemplateId)
  const inbox = configuredTestInbox()
  let messages: { id: string; topic: string; email: string; status: string; category: string | null; urgency: string | null; createdAt: Date }[] = []
  try {
    messages = await prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, topic: true, email: true, status: true, category: true, urgency: true, createdAt: true },
    })
  } catch {
    messages = []
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold">Emails</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Every customer template, with the shared header. Test sends go only to the configured test inbox. From stays the shared Resend sender until a domain is verified.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Email templates" className="flex flex-col gap-1">
          {specs.map((row) => (
            <Link key={row.id} href={`/admin/emails?id=${row.id}&width=${width}`} className={`rounded-lg px-3 py-2 text-sm ${row.id === selected.id ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>
              <span className="font-semibold">{row.id}</span> {row.name}
              <span className="mt-0.5 block text-xs opacity-70">{row.priority} · {row.wired ? 'wired' : 'preview only'}</span>
            </Link>
          ))}
        </nav>
        <section>
          <h2 className="font-display text-xl font-bold">{selected.id} · {selected.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{mail.subject}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Banner: {selected.banner}.png{selected.needsNewBanner ? ' — needs a new banner' : ''} · {selected.kind}
          </p>
          <div className="mt-3 flex gap-2 text-sm">
            <Link href={`/admin/emails?id=${selected.id}&width=600`} className={width === 600 ? 'font-semibold' : 'underline'}>Desktop</Link>
            <Link href={`/admin/emails?id=${selected.id}&width=375`} className={width === 375 ? 'font-semibold' : 'underline'}>375px</Link>
          </div>
          <iframe title={`${selected.name} preview`} src={`/api/admin/emails/preview?id=${selected.id}`} className="mt-4 rounded-2xl border border-border bg-white" style={{ width, maxWidth: '100%', height: 720 }} />
          <h3 className="mt-6 text-sm font-semibold">Plain text</h3>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-4 text-xs">{mail.text}</pre>
          <div className="mt-4">
            <SendTest id={selected.id} inbox={inbox} />
            {!inbox && <p className="mt-2 text-sm text-muted-foreground">Set EMAIL_TEST_INBOX before a test can leave this page.</p>}
          </div>
        </section>
      </div>
      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">Contact messages</h2>
        <p className="mt-1 text-sm text-muted-foreground">Stored and sorted here. The copy still goes to the owner inbox. Nothing is auto-replied.</p>
        {messages.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No stored messages yet.</p> : (
          <ul className="mt-3 divide-y divide-border">
            {messages.map((row) => (
              <li key={row.id} className="py-3 text-sm">
                <span className="font-semibold">{row.topic}</span>
                <span className="text-muted-foreground"> · {row.category || 'unsorted'} · {row.urgency || '—'} · {row.status}</span>
                <span className="block text-muted-foreground">{row.email} · {when(row.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
