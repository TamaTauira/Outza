'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useSaved, type SavedEvent } from '@/lib/saved'
import type { OutingEvent } from '@/lib/outings'

function asSaved(ev: OutingEvent): SavedEvent {
  return {
    id: ev.id, title: ev.title, description: null, date: ev.date, endDate: null, time: ev.time, endTime: ev.endTime ?? null,
    venueName: ev.venueName, suburb: ev.suburb ?? null, category: ev.category, subTags: [], isLGBTI: false, isFree: ev.isFree,
    price: ev.price ?? null, ticketUrl: ev.ticketUrl ?? null, city: ev.city,
  }
}

export function OutingActions({ plan }: { plan: { title: string; city: string; date: string | null; events: OutingEvent[] } }) {
  const { isSaved, toggle } = useSaved()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  if (!plan.events.length) return null
  const saveAll = () => {
    for (const ev of plan.events) if (!isSaved(ev.id)) toggle(asSaved(ev))
    toast.success('Saved to My Outza', { action: { label: 'View', onClick: () => router.push('/watchlist') } })
  }
  const toPlan = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/together', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: plan.title, city: plan.city, planDate: plan.date, eventIds: plan.events.map((ev) => ev.id) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not start the plan')
      router.push(`/together/${data.token}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the plan')
      setBusy(false)
    }
  }
  return (
    <div className="mt-6 flex flex-col sm:flex-row gap-2">
      <button type="button" onClick={saveAll} className="h-11 px-4 rounded-md bg-primary text-primary-foreground font-semibold">Save to My Outza</button>
      <button type="button" disabled={busy} onClick={toPlan} className="h-11 px-4 rounded-md border border-border font-semibold disabled:opacity-60">Add Stops to a Plan</button>
    </div>
  )
}
