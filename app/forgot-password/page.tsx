'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GENERIC_RESET_MESSAGE } from '@/lib/account-trust'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      setMessage(data.message || GENERIC_RESET_MESSAGE)
    } catch {
      setMessage(GENERIC_RESET_MESSAGE)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="We’ll email a link if that address has an account.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
        </div>
        {message && <p className="text-sm text-foreground" role="status">{message}</p>}
        <Button type="submit" className="w-full h-11" disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Send reset link
        </Button>
        <p className="text-sm text-center"><Link href="/login" className="text-primary font-medium hover:underline">Back to sign in</Link></p>
      </form>
    </AuthShell>
  )
}
