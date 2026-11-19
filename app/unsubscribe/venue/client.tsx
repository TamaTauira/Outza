'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function VenueUnsubscribeClient({ u, k }: { u: string; k: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const go = async () => {
    setState('busy')
    try {
      const res = await fetch('/api/venues/report/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ u, k }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      setState('done')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Something went wrong')
      setState('error')
    }
  }
  if (state === 'done') {
    return (
      <>
        <h1 className="mt-4 font-display text-2xl font-bold">Monthly venue notes are off.</h1>
        <p className="mt-2 text-sm text-muted-foreground">You’ll stop getting the monthly stats email. Your newsletter choice is untouched, and the venue dashboard can turn the note back on.</p>
      </>
    )
  }
  return (
    <>
      <h1 className="mt-4 font-display text-2xl font-bold">Pause the monthly venue note?</h1>
      <p className="mt-2 text-sm text-muted-foreground">This only stops the monthly stats email. The newsletter, if you asked for it, keeps coming.</p>
      <Button type="button" onClick={go} disabled={state === 'busy'} className="mt-6 w-full">
        {state === 'busy' ? 'Turning it off…' : 'Unsubscribe'}
      </Button>
      {state === 'error' && <p className="mt-3 text-sm text-destructive">{msg}</p>}
    </>
  )
}
