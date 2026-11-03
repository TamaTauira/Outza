import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { DUPLICATE_THRESHOLDS } from '@/lib/event-identity'
import { SOURCE_REGISTER, type RegisterStatus } from '@/lib/sources/register'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Event sources — VibePeep admin', robots: { index: false } }

const STATUS_LABEL: Record<RegisterStatus, string> = {
  integrated: 'Integrated',
  partial: 'Partially integrated',
  queued: 'Queued',
  recommended: 'Recommended',
  permission: 'Needs permission',
  unsuitable: 'Not suitable',
}

export default async function AdminSourcesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin/sources')
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold mb-2">Admins only</h1>
        <p className="text-muted-foreground">Source health is for the site owner.</p>
      </main>
    )
  }

  let alerts: { id: string; kind: string; source: string; detail: string | null; createdAt: Date }[] = []
  let reviews: { id: string; action: string; detail: string | null; createdAt: Date }[] = []
  let alertNote: string | null = null
  try {
    const [alertRows, reviewRows] = await Promise.all([
      prisma.dataQualityAlert.findMany({ orderBy: { createdAt: 'desc' }, take: 40 }),
      prisma.qualityAudit.findMany({
        where: { action: { in: ['DUPLICATE_MERGED', 'DUPLICATE_FLAGGED', 'DUPLICATE_REVIEW', 'TIME_CONFLICT'] } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, action: true, detail: true, createdAt: true },
      }),
    ])
    alerts = alertRows
    reviews = reviewRows
  } catch {
    alertNote = 'Quality alerts appear after prisma/sql/20261103_source_identity.sql is applied. The register below does not need that migration.'
  }

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-3xl font-bold">Event sources</h1>
      <p className="text-muted-foreground mt-1 mb-6">
        Duplicate links need a score of {DUPLICATE_THRESHOLDS.auto} with a strong id, or {DUPLICATE_THRESHOLDS.corroborate} with a second agreeing fact.
        An empty feed raises an alert and does not delete listings.
      </p>

      <section className="rounded-xl bg-card shadow-sm p-5 mb-6">
        <h2 className="font-display text-lg font-bold">Alerts</h2>
        {alertNote && <p className="text-sm text-muted-foreground mt-2">{alertNote}</p>}
        {!alertNote && alerts.length === 0 && <p className="text-sm text-muted-foreground mt-2">No data-quality alerts stored.</p>}
        {alerts.length > 0 && (
          <ul className="mt-3 space-y-3">
            {alerts.map((row) => (
              <li key={row.id} className="text-sm">
                <p className="font-medium">{row.source} · {row.kind}</p>
                <p className="text-muted-foreground">{row.detail}</p>
                <p className="text-xs text-muted-foreground">{row.createdAt.toISOString()}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-card shadow-sm p-5 mb-6">
        <h2 className="font-display text-lg font-bold">Recent duplicate decisions</h2>
        {reviews.length === 0 && <p className="text-sm text-muted-foreground mt-2">None in the latest quality audits.</p>}
        {reviews.length > 0 && (
          <ul className="mt-3 space-y-3">
            {reviews.map((row) => (
              <li key={row.id} className="text-sm">
                <p className="font-medium">{row.action}</p>
                <p className="text-muted-foreground">{row.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-card shadow-sm p-5">
        <h2 className="font-display text-lg font-bold mb-3">Source register</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <caption className="sr-only">National event source register</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium">Source</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 pr-3 font-medium">Decision</th>
                <th scope="col" className="py-2 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {SOURCE_REGISTER.map((row) => (
                <tr key={row.id} className="border-b border-border align-top">
                  <th scope="row" className="py-2 pr-3 font-medium">
                    <Link href={row.website} className="underline" rel="noreferrer">{row.name}</Link>
                    <span className="block font-normal text-muted-foreground">{row.coverage}</span>
                  </th>
                  <td className="py-2 pr-3">{STATUS_LABEL[row.status]}</td>
                  <td className="py-2 pr-3">{row.decision}</td>
                  <td className="py-2 text-muted-foreground">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
