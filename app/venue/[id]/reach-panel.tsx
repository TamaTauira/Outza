'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ReachDashboard } from '@/components/reach-dashboard'
import { Chip } from '@/components/ui/chip'
import type { ReachPayload } from '@/lib/organiser-reach-load'

export function VenueReachPanel({ venueId }: { venueId: string }) {
  const [range, setRange] = useState('28')
  const [payload, setPayload] = useState<ReachPayload | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/venues/${venueId}/reach?range=${range}`)
      .then((res) => { if (!res.ok) throw new Error('reach') ; return res.json() })
      .then((data) => { if (live) { setPayload(data); setError(false) } })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [venueId, range])

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        {['7', '28', '90'].map((item) => (
          <Chip key={item} pressed={range === item} onClick={() => setRange(item)}>Last {item} days</Chip>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">This is the room, not another organiser’s spend. Views and clicks are not attendance.</p>
      {!payload && !error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Crunching the room…</p>}
      {error && <p className="text-sm text-muted-foreground">Venue results are having a lie-down. Try again in a minute.</p>}
      {payload && <ReachDashboard payload={payload} csvHref={`/api/venues/${venueId}/reach/export?range=${range}`} />}
    </div>
  )
}
