'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type PlanRow = { token: string; name: string; city: string | null; items: number }

/** Adds one event to an Outza Together plan. Anyone with the invite link can vote. */
export function AddToPlanButton({ eventId, city, className }: { eventId: string; city?: string | null; className?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/together').then((r) => r.json()).then((d) => setPlans(d?.plans ?? [])).catch(() => setPlans([]))
  }, [open])

  const go = (token: string) => {
    setOpen(false)
    router.push(`/together/${token}`)
  }

  const addTo = async (token: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/together/${token}/items`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not add it')
      toast.success('Added to the plan')
      go(token)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add it')
    } finally { setBusy(false) }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/together', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, city: city || undefined, eventIds: [eventId] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not create the plan')
      toast.success('Plan started')
      go(data.token)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the plan')
    } finally { setBusy(false) }
  }

  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border border-border font-semibold hover:bg-muted">
        <Users className="w-4 h-4" />{open ? 'Close Plan' : 'Add to a Plan'}
      </button>
      {open && (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 space-y-3">
          <p className="text-sm text-muted-foreground">Shortlist it with friends. They open your link and vote. No friend list required.</p>
          {plans.map((plan) => (
            <button key={plan.token} type="button" disabled={busy} onClick={() => addTo(plan.token)} className={cn('w-full text-left rounded-md bg-card px-3 py-2 text-sm hover:bg-background', busy && 'opacity-60')}>
              <span className="font-semibold">{plan.name}</span>
              <span className="text-muted-foreground"> · {plan.items} options</span>
            </button>
          ))}
          <form onSubmit={create} className="flex flex-col sm:flex-row gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="New plan name" className="flex-1 min-w-0 h-10 rounded-md border border-border bg-background px-3 text-sm" />
            <button disabled={busy} className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}Start Plan
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
