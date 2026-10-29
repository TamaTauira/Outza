'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Check, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { venueKey } from '@/lib/together'

/** Follow an interest tag (stored with account categories) or a venue. Signed-in only. */
export function FollowListing({ category, venueName, city }: { category?: string | null; venueName?: string | null; city?: string | null }) {
  const { data: session, status } = useSession() || {}
  const router = useRouter()
  const [tags, setTags] = useState<string[]>([])
  const [venues, setVenues] = useState<string[]>([])
  const key = venueName ? venueKey(venueName, city) : ''

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancel = false
    fetch('/api/me/follows').then((r) => r.json()).then((d) => {
      if (cancel) return
      setTags(d?.tags ?? [])
      setVenues((d?.venues ?? []).map((v: { venueKey: string }) => v.venueKey))
    }).catch(() => {})
    return () => { cancel = true }
  }, [status])

  const goLogin = () => router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)

  const toggle = async (kind: 'tag' | 'venue', value: string, on: boolean) => {
    if (!session?.user) { goLogin(); return }
    const res = await fetch('/api/me/follows', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, value, city, follow: !on }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data?.error ?? 'Could not update that'); return }
    if (kind === 'tag') setTags(data.tags ?? [])
    else setVenues((list) => on ? list.filter((item) => item !== key) : [...list, key])
    toast.success(on ? 'Removed from My VibePeep' : 'Following. New matches can land in your email if you opt in.')
  }

  if (status === 'loading') return null
  const tagOn = !!category && tags.includes(category)
  const venueOn = !!key && venues.includes(key)

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {category && (
        <button type="button" onClick={() => toggle('tag', category, tagOn)} aria-pressed={tagOn}
          className={cn('inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-sm font-semibold', tagOn ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}>
          {tagOn ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {tagOn ? `Following ${category}` : `Follow ${category}`}
        </button>
      )}
      {venueName && (
        <button type="button" onClick={() => toggle('venue', venueName, venueOn)} aria-pressed={venueOn}
          className={cn('inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-sm font-semibold', venueOn ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}>
          {venueOn ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {venueOn ? `Following ${venueName}` : `Follow ${venueName}`}
        </button>
      )}
    </div>
  )
}
