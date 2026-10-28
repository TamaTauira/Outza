'use client'

import { useState } from 'react'

export function UnsubscribeClient({ u, k, s }: { u: string; k: string; s: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const go = async () => {
    setState('busy')
    try {
      const r = await fetch('/api/nl/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ u, k, s }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Something went wrong')
      setState('done')
    } catch (e: any) {
      console.error('Unsubscribe failed:', e)
      setMsg(e?.message ?? 'Something went wrong')
      setState('error')
    }
  }
  if (state === 'done') {
    return (
      <>
        <h1 className="mt-4 font-display text-2xl font-bold">No hard feelings.</h1>
        <p className="mt-2 text-muted-foreground text-sm">Newsletters are off. Your saved events and account haven’t gone anywhere.</p>
      </>
    )
  }
  return (
    <>
      <h1 className="mt-4 font-display text-2xl font-bold">Breaking up with our emails?</h1>
      <p className="mt-2 text-muted-foreground text-sm">You’ll stop receiving the newsletter. You can switch it back on, or just change how often it arrives, in your account.</p>
      <button onClick={go} disabled={state === 'busy'} className="mt-6 w-full h-11 rounded-full bg-primary text-primary-foreground font-semibold disabled:opacity-60">
        {state === 'busy' ? 'Unsubscribing…' : 'Unsubscribe'}
      </button>
      {state === 'error' && <p className="mt-3 text-sm text-red-500">{msg}</p>}
    </>
  )
}
