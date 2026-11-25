'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

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
        <h1 className="mt-4 font-display text-h1">No hard feelings.</h1>
        <p className="mt-2 text-muted-foreground text-sm">Newsletters, the saved-event digest and reminders are off. They share one switch. Your saved events and account haven’t gone anywhere.</p>
      </>
    )
  }
  return (
    <>
      <h1 className="mt-4 font-display text-h1">Breaking up with our emails?</h1>
      <p className="mt-2 text-muted-foreground text-sm">You’ll stop the newsletter, the saved-event digest and reminders. They share one switch. You can turn that switch back on from your account.</p>
      <Button onClick={go} disabled={state === 'busy'} loading={state === 'busy'} className="mt-6 w-full">Unsubscribe</Button>
      {state === 'error' && <p className="mt-3 text-sm text-destructive">{msg}</p>}
    </>
  )
}
