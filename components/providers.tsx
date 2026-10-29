'use client'

import { useEffect, useRef } from 'react'
import { SessionProvider, useSession } from 'next-auth/react'
import { syncSavedWithAccount, setSavedAccountLinked } from '@/lib/saved'
import { bindItineraryUser } from '@/lib/itinerary'
import { ProfileGate } from '@/components/profile-gate'
import { installScrollMemory } from '@/lib/scroll-memory'

function SavedSync() {
  const { data, status } = useSession()
  const synced = useRef<string | null>(null)
  useEffect(() => {
    if (status === 'loading') return
    const id = status === 'authenticated' ? data?.user?.id ?? null : null
    setSavedAccountLinked(!!id, id)
    bindItineraryUser(id)
    if (id && synced.current !== id) {
      synced.current = id
      syncSavedWithAccount(id)
    }
    if (!id) synced.current = null
  }, [data, status])
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => { installScrollMemory() }, [])
  return (
    <SessionProvider>
      <SavedSync />
      {children}
      <ProfileGate />
    </SessionProvider>
  )
}
