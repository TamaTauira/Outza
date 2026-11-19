'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'

function VerifyInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token')?.trim() ?? ''
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')

  async function go() {
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/venues/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'That link didn’t work. Ask for a new one from the venue claim.')
        return
      }
      setDone(data.statusText === 'APPROVED' ? 'You’re in. The venue dashboard is open.' : 'Email checked. A person still needs to review this claim.')
      if (data.venueId && data.statusText === 'APPROVED') router.push(`/venue/${data.venueId}`)
    } catch {
      setError('That link didn’t work. Ask for a new one from the venue claim.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {!token && <p className="text-sm text-destructive" role="alert">That verification link is missing or no longer valid.</p>}
      {done && <p className="text-sm" role="status">{done}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {!done && token && (
        <Button type="button" className="w-full h-11" disabled={busy} onClick={go}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Use this link
        </Button>
      )}
      <p className="text-center text-sm"><Link href="/" className="font-medium text-primary hover:underline">Back to events</Link></p>
    </div>
  )
}

export default function VerifyVenuePage() {
  return (
    <AuthShell
      title="Confirm your venue email"
      subtitle="This link shows the inbox on the claim can be read. It does not by itself decide who owns the venue."
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking the link…</p>}>
        <VerifyInner />
      </Suspense>
    </AuthShell>
  )
}
