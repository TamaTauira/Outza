import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { PRO_PLAN, formatAud, productName } from '@/lib/tiers'
import { VibePeepLogo } from '@/components/vibepeep-logo'
import { PrintButton } from './print-button'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Invoice | VibePeep', robots: { index: false } }

const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney' })

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const me = session?.user
  if (!me?.id) redirect(`/login?as=promoter&callbackUrl=/promoter/invoice/${encodeURIComponent(id)}`)
  const isAdmin = me.role === 'ADMIN'

  const buyer = { name: '', email: '' }
  let lines: { label: string; detail: string; cents: number }[] = []
  let issued: Date | null = null
  let test = false
  let status = ''

  const promos = await prisma.promotion.findMany({
    where: { OR: [{ orderId: id }, { id }], status: { not: 'PENDING' } },
    include: { event: { select: { title: true } } },
    orderBy: { createdAt: 'asc' },
  })
  if (promos.length) {
    const owner = promos[0].promoterId
    if (owner !== me.id && !isAdmin) notFound()
    const u = await prisma.user.findUnique({ where: { id: owner }, select: { name: true, orgName: true, email: true } })
    buyer.name = u?.orgName || u?.name || ''; buyer.email = u?.email ?? ''
    lines = promos.map((p) => ({ label: `${productName(p.tier)}${p.days ? ` (${p.days} days)` : ''}`, detail: p.event.title, cents: p.amountCents }))
    issued = promos[0].createdAt; test = promos.some((p) => p.paymentMode === 'test')
    status = promos.every((p) => p.status === 'CANCELLED') ? 'Cancelled' : 'Paid'
  } else {
    const pass = await prisma.proPass.findUnique({ where: { id }, include: { user: { select: { name: true, orgName: true, email: true } } } })
    if (!pass || pass.status === 'PENDING') notFound()
    if (pass.userId !== me.id && !isAdmin) notFound()
    buyer.name = pass.user.orgName || pass.user.name || ''; buyer.email = pass.user.email ?? ''
    lines = [{ label: PRO_PLAN.name, detail: `${PRO_PLAN.days}-day membership${pass.endsAt ? `, until ${fmt(pass.endsAt)}` : ''}`, cents: pass.amountCents }]
    issued = pass.createdAt; test = pass.paymentMode === 'test'
    status = pass.status === 'CANCELLED' ? 'Cancelled' : 'Paid'
  }

  const total = lines.reduce((s, l) => s + l.cents, 0)
  const gst = Math.round(total / 11)
  const number = `VIBEPEEP-${(issued ?? new Date()).toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(-6).toUpperCase()}`

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 print:py-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/promoter?tab=billing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to billing</Link>
        <PrintButton />
      </div>
      <article className="mt-6 rounded-xl bg-white text-neutral-900 shadow-sm border border-neutral-200 p-8 print:shadow-none print:border-0 print:mt-0">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <VibePeepLogo tone="on-light" />
          <div className="text-right">
            <p className="text-2xl font-bold">Invoice / receipt</p>
            <p className="text-sm text-neutral-600 mt-1">No. {number}</p>
            <p className="text-sm text-neutral-600">Issued {issued ? fmt(issued) : ''}</p>
            <p className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-neutral-100">{status}</p>
          </div>
        </header>
        {test && <p className="mt-6 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">Test-mode purchase: no card was charged. This document is for your records only.</p>}
        <section className="mt-8 grid sm:grid-cols-2 gap-6 text-sm">
          <div><p className="text-xs uppercase tracking-wider text-neutral-500">From</p><p className="font-semibold mt-1">VibePeep</p><p className="text-neutral-600">Event promotion services</p></div>
          <div><p className="text-xs uppercase tracking-wider text-neutral-500">Billed to</p><p className="font-semibold mt-1">{buyer.name || buyer.email}</p>{buyer.name && <p className="text-neutral-600">{buyer.email}</p>}</div>
        </section>
        <table className="mt-8 w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-200"><th className="py-2 font-medium">Item</th><th className="py-2 font-medium text-right">Amount (AUD)</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.map((l, i) => (
              <tr key={i}><td className="py-3"><p className="font-medium">{l.label}</p><p className="text-xs text-neutral-500">{l.detail}</p></td><td className="py-3 text-right tabular-nums">{formatAud(l.cents)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 ml-auto w-full sm:w-72 text-sm space-y-1.5">
          <div className="flex justify-between text-neutral-600"><span>Includes GST (1/11)</span><span className="tabular-nums">{formatAud(gst)}</span></div>
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-bold"><span>Total (GST inclusive)</span><span className="tabular-nums">{formatAud(total)}</span></div>
        </div>
        <p className="mt-10 text-xs text-neutral-500">Sponsored placements are shown as labelled sponsored content. Placement and reach depend on available inventory; no specific number of impressions or clicks is guaranteed.</p>
      </article>
    </main>
  )
}
