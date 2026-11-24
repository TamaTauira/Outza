'use client'

import { useState } from 'react'

export function SendTest({ id, inbox }: { id: string; inbox: string | null }) {
  const [to, setTo] = useState(inbox ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/emails/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, to }),
      })
      const data = await res.json().catch(() => ({}))
      setMsg(res.ok ? `Sent to ${data.to}` : (typeof data.error === 'string' ? data.error : 'That test did not send.'))
    } catch {
      setMsg('That test did not send.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm" htmlFor="test-inbox">Send test to</label>
      <input id="test-inbox" value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" className="h-9 rounded-full border border-border bg-background px-3 text-sm" placeholder="Test inbox only" />
      <button type="button" onClick={send} disabled={busy || !inbox} className="h-9 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50">
        {busy ? 'Sending…' : 'Send test'}
      </button>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  )
}
