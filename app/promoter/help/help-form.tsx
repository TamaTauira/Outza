'use client'

import { useState } from 'react'
import { toast } from 'sonner'

export function HelpForm({ email }: { email: string }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic: 'Purchase', email, message, company: '' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not send that')
      setMessage('')
      toast.success('Sent. We’ll reply to this email.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send that')
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={send} className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-semibold">Write to us</h2>
      <p className="mt-1 text-sm text-muted-foreground">Billing, a campaign, or a listing. Replies go to {email}.</p>
      <label className="mt-4 block text-sm font-medium">Message
        <textarea required minLength={8} maxLength={4000} rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
      </label>
      <button disabled={busy} className="mt-4 h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? 'Sending…' : 'Send'}</button>
    </form>
  )
}
