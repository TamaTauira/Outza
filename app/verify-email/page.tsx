'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'

function VerifyForm() {
  const params = useSearchParams()
  const { update } = useSession()
  const token = params.get('token') ?? ''
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function verify() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'That link has expired or already been used.'); return }
      setDone(true)
      await update().catch(() => {})
    } catch {
      setError('Verification could not be finished. Try the link again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {!token && <p className="text-sm text-destructive" role="alert">That verification link is missing.</p>}
      {done && <p className="text-sm" role="status">Email verified. You can publish listings and pay for promotions.</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {!done && (
        <Button type="button" className="w-full h-11" disabled={loading || !token} onClick={verify}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Verify Email
        </Button>
      )}
      <p className="text-sm text-center"><Link href="/" className="text-primary font-medium hover:underline">Back to events</Link></p>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <AuthShell title="Verify your email" subtitle="Verify once and you can publish and pay. Browse and save work either way.">
      <Suspense fallback={null}><VerifyForm /></Suspense>
    </AuthShell>
  )
}
