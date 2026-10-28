'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function BecomePromoter() {
  const router = useRouter()
  const { update } = useSession() || {}
  const [loading, setLoading] = useState(false)

  async function switchRole() {
    setLoading(true)
    try {
      const r = await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'PROMOTER' }) })
      if (!r.ok) throw new Error(`Request failed (${r.status})`)
      await update?.()
      toast.success('You’re now a promoter')
      router.replace('/promoter')
      router.refresh()
    } catch (e) {
      console.error(e)
      toast.error('Could not switch your account. Please try again.')
      setLoading(false)
    }
  }

  return (
    <Button onClick={switchRole} disabled={loading} className="h-10 px-5 font-semibold">
      {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Switch my account to promoter
    </Button>
  )
}
