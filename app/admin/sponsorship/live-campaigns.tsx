'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { endCampaignConfirm } from '@/lib/promotion-end'
import { formatAud } from '@/lib/tiers'

type Row = {
  id: string
  eventId: string
  title: string
  product: string
  days: number | null
  paymentMode: string
  endsAt: string | null
  amountCents: number
}

export function LiveCampaigns() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState('')

  const load = () => {
    fetch('/api/admin/promotions')
      .then((res) => res.json())
      .then((data) => setRows(Array.isArray(data?.campaigns) ? data.campaigns : []))
      .catch(() => setRows([]))
  }

  useEffect(() => { load() }, [])

  const end = async (row: Row) => {
    const test = row.paymentMode === 'test'
    if (!window.confirm(endCampaignConfirm(`${row.product} on ${row.title}`, test))) return
    setBusy(row.eventId)
    try {
      const res = await fetch('/api/admin/promotions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId: row.eventId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not end that campaign')
      toast.success(typeof data.message === 'string' ? data.message : 'Campaign ended')
      load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not end that campaign')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="mt-8">
      <h2 className="font-semibold">Live campaigns</h2>
      <p className="mt-1 text-sm text-muted-foreground">End takes a Spotlight, Boost or Headliner off the board. Test mode does not refund a card, because no card was charged. A paid campaign is not refunded from this button.</p>
      {rows === null ? <p className="mt-3 text-sm text-muted-foreground">Loading campaigns…</p> : !rows.length ? <p className="mt-3 text-sm text-muted-foreground">No live campaigns.</p> : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{row.title}</span>
                <span className="text-xs text-muted-foreground">{row.product}{row.days ? ` · ${row.days}d` : ''} · {row.paymentMode === 'test' ? 'test' : 'card'} · {formatAud(row.amountCents)}</span>
              </span>
              <button type="button" onClick={() => end(row)} disabled={busy === row.eventId} className="h-11 rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-60">End campaign</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
