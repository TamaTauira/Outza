'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Saved = { month: string; amount: string; note: string | null }

export function SpendForm({ currentMonth, saved }: { currentMonth: string; saved: Saved[] }) {
  const router = useRouter()
  const current = saved.find((item) => item.month === currentMonth)
  const [month, setMonth] = useState(currentMonth)
  const [amount, setAmount] = useState(current?.amount ?? '')
  const [note, setNote] = useState(current?.note ?? '')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  function chooseMonth(next: string) {
    const row = saved.find((item) => item.month === next)
    setMonth(next)
    setAmount(row?.amount ?? '')
    setNote(row?.note ?? '')
    setMessage('')
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/admin/metrics/spend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ month, amount, note }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(typeof data?.error === 'string' ? data.error : 'That didn’t save.')
        return
      }
      setMessage('Saved. This month’s acquisition cost will use it.')
      router.refresh()
    } catch {
      setMessage('That didn’t save. Give it another go.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 border-t border-border pt-4">
      <p className="text-sm font-semibold">Monthly marketing spend</p>
      <p className="mt-1 text-xs text-muted-foreground">The only number this page can’t see for itself. Ads, posters, the lot. Zero is fine if we spent nothing.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[9rem_1fr]">
        <label className="block text-xs text-muted-foreground">
          Month
          <input type="month" value={month} max={currentMonth} onChange={(e) => chooseMonth(e.target.value)} required className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" />
        </label>
        <label className="block text-xs text-muted-foreground">
          Spend in AUD
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" aria-label="Marketing spend in Australian dollars" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
        </label>
      </div>
      <label className="mt-3 block text-xs text-muted-foreground">
        Note, if you want one
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
      </label>
      <button type="submit" disabled={busy} className="mt-3 inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-60">
        {busy ? 'Saving…' : 'Save this month'}
      </button>
      {message && <p className="mt-2 text-sm" role="status">{message}</p>}
      {!!saved.length && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {saved.slice(-6).map((row) => (
            <li key={row.month}>{row.month} · ${row.amount}{row.note ? ` · ${row.note}` : ''}</li>
          ))}
        </ul>
      )}
    </form>
  )
}
