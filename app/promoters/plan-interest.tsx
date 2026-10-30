'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

/** "Register interest" for a business plan that isn't on sale yet. Stored as a promoter suggestion. */
export function PlanInterest({ plan, signedIn }: { plan: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (!signedIn && !/^\S+@\S+\.\S+$/.test(email)) { toast.error('Enter your email so we can let you know'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/sponsorships/quote', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'PLAN', email, note: plan, planId: plan === 'Local Pro' ? 'LOCAL_PRO' : plan === 'Growth' ? 'GROWTH' : plan === 'Venue Plus' ? 'VENUE_PLUS' : undefined }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Request failed')
      setDone(true); toast.success('Quote requested. Nothing was charged.')
    } catch (err) {
      console.error('Plan interest failed:', err); toast.error('Could not register interest — please try again')
    } finally { setBusy(false) }
  }

  if (done) return <p className="text-sm font-medium text-primary">Quote requested</p>
  if (signedIn || open) {
    return (
      <div className="flex flex-col sm:flex-row gap-2">
        {!signedIn && <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" className="h-10 rounded-md border border-border bg-background px-3 text-sm flex-1 min-w-0" aria-label={`Email for ${plan} updates`} />}
        <button onClick={submit} disabled={busy} className="h-10 px-4 rounded-md border border-border text-sm font-semibold hover:bg-muted disabled:opacity-60 inline-flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}Request a quote
        </button>
      </div>
    )
  }
  return <button onClick={() => setOpen(true)} className="h-10 px-4 rounded-md border border-border text-sm font-semibold hover:bg-muted">Request a quote</button>
}
