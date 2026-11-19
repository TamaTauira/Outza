'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Price, time, image and cancellation. The public page labels these from the venue. */
export function VenueCorrectionForm({ venueId, event, onSaved }: {
  venueId: string
  event: { id: string; title: string; price?: string | null; time: string | null; imageUrl: string | null; status: string }
  onSaved: (patch: { price?: string; time?: string; imageUrl?: string; status?: string }) => void
}) {
  const [price, setPrice] = useState(event.price || '')
  const [time, setTime] = useState(event.time || '')
  const [imageUrl, setImageUrl] = useState(event.imageUrl || '')
  const [cancel, setCancel] = useState(event.status === 'CANCELLED')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/corrections`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          price,
          time,
          imageUrl,
          status: cancel ? 'CANCELLED' : event.status === 'CANCELLED' ? 'SCHEDULED' : undefined,
          confirmed,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save')
      toast.success('Saved. The listing now says from the venue.')
      onSaved({
        price,
        time,
        imageUrl,
        status: cancel ? 'CANCELLED' : event.status === 'CANCELLED' ? 'SCHEDULED' : event.status,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">Corrections show straight away, labelled from the venue. The next refresh keeps them.</p>
      <Input aria-label={`Price for ${event.title}`} placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
      <Input aria-label={`Start time for ${event.title}`} placeholder="Start time, 19:30" value={time} onChange={(e) => setTime(e.target.value)} />
      <Input aria-label={`Image link for ${event.title}`} placeholder="Image https link" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cancel} onChange={(e) => setCancel(e.target.checked)} />
        Cancelled
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
        <span>I mean to change the time or the cancellation. People may already be planning around the old details.</span>
      </label>
      <Button type="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save correction'}</Button>
    </div>
  )
}
