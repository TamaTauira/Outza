'use client'

import { useState } from 'react'

export function ReportUnsubscribeClient({ u, k }: { u: string; k: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const go = async () => {
    setState('busy')
    try {
      const res = await fetch('/api/promoter/report/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ u, k }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      setState('done')
    } catch (err) {
      console.error('Recap unsubscribe failed', err)
      setMsg(err instanceof Error ? err.message : 'Something went wrong')
      setState('error')
    }
  }
  if (state === 'done') {
    return (
      <>
        <h1 className="mt-4 font-display text-2xl font-bold">Weekly recaps are off.</h1>
        <p className="mt-2 text-sm text-muted-foreground">You’ll stop getting the promoter performance note. Your newsletter choice is untouched, and the dashboard can turn the recap back on.</p>
      </>
    )
  }
  return (
    <>
      <h1 className="mt-4 font-display text-2xl font-bold">Pause the weekly recap?</h1>
      <p className="mt-2 text-sm text-muted-foreground">This only stops the promoter performance email. The newsletter, if you asked for it, keeps coming.</p>
      <button type="button" onClick={go} disabled={state === 'busy'} className="mt-6 h-11 w-full rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-60">
        {state === 'busy' ? 'Turning it off…' : 'Unsubscribe'}
      </button>
      {state === 'error' && <p className="mt-3 text-sm text-red-500">{msg}</p>}
    </>
  )
}
