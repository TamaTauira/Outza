'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

/** "Register interest" for a business plan that isn't on sale yet. Stored as a promoter suggestion. Nothing is charged. */
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

  if (done) return <p className="text-sm font-semibold text-[#9F1239]" role="status">Quote requested. Nothing was charged.</p>
  if (signedIn || open) {
    return (
      <div className="flex w-full flex-col gap-2">
        {!signedIn && (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            autoComplete="email"
            className="h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9F1239]"
            aria-label={`Email for ${plan} updates`}
          />
        )}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9F1239] disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}Request a quote
        </button>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-expanded={false}
      className="inline-flex h-11 w-full items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9F1239]"
    >
      Get notified
    </button>
  )
}
