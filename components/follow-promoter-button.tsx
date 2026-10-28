'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    <button type="button" onClick={onClick} disabled={busy} aria-pressed={following}
      className={cn('inline-flex items-center gap-1 h-7 px-3 rounded-full border text-xs font-semibold transition-colors disabled:opacity-60',
        following ? 'bg-primary text-primary-foreground border-primary' : 'border-primary text-primary hover:bg-primary/10')}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : following ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
      {following ? 'Following' : 'Follow'}
    </button>
  )
}
