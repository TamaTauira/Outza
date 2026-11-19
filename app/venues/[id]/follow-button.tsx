'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/** Follows the venue through the existing watchlist. New listings can land in that email. */
export function FollowVenueButton({ name, city, following, signedIn, nextPath }: {
  name: string
  city: string
  following: boolean
  signedIn: boolean
  nextPath: string
}) {
  const router = useRouter()
  const [on, setOn] = useState(following)
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(nextPath)}`)
      return
    }
    setBusy(true)
    const next = !on
    try {
      const res = await fetch('/api/me/follows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'venue', value: name, city, follow: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update that')
      setOn(next)
      toast.success(next ? 'You’ll hear when this venue lists something new.' : 'You’ve stopped following this venue.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update that')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button type="button" variant={on ? 'outline' : 'default'} disabled={busy} onClick={toggle} className="w-full">
      {busy ? 'Saving…' : on ? 'Following' : 'Follow this venue'}
    </Button>
  )
}
