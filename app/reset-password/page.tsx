'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function ResetForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'That link has expired or already been used.'); return }
      router.replace('/login?reset=1')
    } catch {
      setError('The password could not be changed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {!token && <p className="text-sm text-destructive" role="alert">That reset link is missing. Ask for a new one.</p>}
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="w-full h-11" disabled={loading || !token}>
        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save password
      </Button>
      <p className="text-sm text-center"><Link href="/forgot-password" className="text-primary font-medium hover:underline">Ask for a new link</Link></p>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password" subtitle="This signs you out of every other session.">
      <Suspense fallback={null}><ResetForm /></Suspense>
    </AuthShell>
  )
}
