'use client'

import { useEffect, useRef } from 'react'
import { SessionProvider, useSession } from 'next-auth/react'
import { syncSavedWithAccount, setSavedAccountLinked } from '@/lib/saved'
import { ProfileGate } from '@/components/profile-gate'
import { installScrollMemory } from '@/lib/scroll-memory'

function SavedSync() {
  const { data, status } = useSession()
  const synced = useRef<string | null>(null)
  useEffect(() => {
    const id = data?.user?.id
    setSavedAccountLinked(status === 'authenticated' && !!id)
    if (status === 'authenticated' && id && synced.current !== id) {
      synced.current = id
      syncSavedWithAccount()
    }
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
