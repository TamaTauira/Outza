'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, Plus } from 'lucide-react'
import { Chip } from '@/components/ui/chip'

/** Follow / unfollow the promoter behind an event. Signed-out people are sent to log in and brought back. */
export function FollowPromoterButton({ promoterId, initialFollowing, signedIn }: { promoterId: string; initialFollowing: boolean; signedIn: boolean }) {
  const [following, setFollowing] = useState(initialFollowing)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  const onClick = async () => {
    if (!signedIn) { router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`); return }
    const next = !following
    setBusy(true)
    try {
      const res = await fetch(`/api/promoters/${promoterId}/follow`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ follow: next }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Could not update follow')
      setFollowing(next)
      toast.success(next ? 'Following! Their next events will find you.' : 'Unfollowed. No hard feelings.')
    } catch (err) { console.error('Follow failed:', err); toast.error(err instanceof Error ? err.message : 'Could not update follow') } finally { setBusy(false) }
  }

  return (
    <Chip pressed={following} onClick={onClick} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : following ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      {following ? 'Following' : 'Follow'}
    </Chip>
  )
}
