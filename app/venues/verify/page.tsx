'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { toast } from 'sonner'

function VerifyInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  const go = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/venues/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'That link didn’t work')
      setDone(data.statusText === 'APPROVED' ? 'You’re verified. The venue dashboard is open.' : 'Email checked. A person still needs to review this claim.')
      if (data.venueId && data.statusText === 'APPROVED') router.push(`/venue/${data.venueId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That link didn’t work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="max-w-md mx-auto px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-bold">Confirm your venue email</h1>
      {done ? <p className="mt-4 text-sm">{done}</p> : (
        <button type="button" disabled={busy || !token} onClick={go} className="mt-6 h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
          {token ? 'Use this link' : 'This link is missing a code'}
        </button>
      )}
    </main>
  )
}

export default function VerifyVenuePage() {
  return <Suspense fallback={<main className="max-w-md mx-auto px-4 py-16 text-sm text-muted-foreground">Checking the link…</main>}><VerifyInner /></Suspense>
}
