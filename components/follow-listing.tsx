'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Check, Plus } from 'lucide-react'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { venueKey } from '@/lib/together'

/** Follow an interest tag (stored with account categories) or a venue. Signed-in only. */
export function FollowListing({ category, venueName, city, className }: { category?: string | null; venueName?: string | null; city?: string | null; className?: string }) {
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
    toast.success(on ? 'Unfollowed' : 'Following. New matches can land in your email if you opt in.')
  }

  if (status === 'loading' || (!category && !venueName)) return null
  const tagOn = !!category && tags.includes(category)
  const venueOn = !!key && venues.includes(key)

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {category && (
        <Chip pressed={tagOn} onClick={() => toggle('tag', category, tagOn)}>
          {tagOn ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {tagOn ? `Following ${category}` : `Follow ${category}`}
        </Chip>
      )}
      {venueName && (
        <Chip pressed={venueOn} onClick={() => toggle('venue', venueName, venueOn)}>
          {venueOn ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {venueOn ? `Following ${venueName}` : `Follow ${venueName}`}
        </Chip>
      )}
    </div>
  )
}
