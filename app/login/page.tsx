'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { establishSession } from '@/lib/establish-session'
import { requestedNext, safeNextPath } from '@/lib/safe-next'
import { Building2, Loader2, Megaphone, Ticket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PRO_PLAN, TIERS, formatAud } from '@/lib/tiers'
import { AuthShell } from '@/components/auth-shell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordField } from '@/components/password-field'
import { Button } from '@/components/ui/button'
import { GoogleButton } from '@/components/google-button'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const requested = requestedNext(params.get('next'), params.get('callbackUrl'))
  const partnerEntry = params.get('as') === 'partner' || requested?.startsWith('/partners')
  const [mode, setMode] = useState<'CONSUMER' | 'PROMOTER' | 'PARTNER'>(partnerEntry ? 'PARTNER' : params.get('as') === 'promoter' || requested?.startsWith('/promoter') ? 'PROMOTER' : 'CONSUMER')
  const next = safeNextPath(requested, mode === 'PARTNER' ? '/partners' : mode === 'PROMOTER' ? '/promoter' : '/')
  const [email, setEmail] = useState(() => params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const created = params.get('created') === '1'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const ok = await establishSession(email.trim().toLowerCase(), password)
    setLoading(false)
    if (!ok) { setError('That email or password didn’t match. If you don’t have an account yet, create one first.'); return }
    router.replace(next)
  }

  const modes = [
    { key: 'CONSUMER' as const, label: 'Event-goer', sub: 'Saves & emails', Icon: Ticket },
    { key: 'PROMOTER' as const, label: 'Promoter', sub: 'List, boost, check the numbers', Icon: Megaphone },
  ]

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === 'PARTNER' ? (
        <div className="rounded-xl border border-primary bg-primary/10 p-3 ring-1 ring-primary">
          <Building2 className="mb-1.5 h-5 w-5 text-primary" />
          <div className="text-sm font-semibold">Source partner</div>
          <div className="text-xs text-muted-foreground">Read-only numbers for your listings</div>
          <button type="button" className="mt-2 text-sm font-medium text-primary hover:underline" onClick={() => setMode('CONSUMER')}>Event-goer or promoter sign in</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Sign in as">
          {modes.map(({ key, label, sub, Icon }) => (
            <button key={key} type="button" role="radio" aria-checked={mode === key} onClick={() => setMode(key)}
              className={cn('rounded-xl border p-3 text-left transition-all', mode === key ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border hover:bg-muted')}>
              <Icon className={cn('w-5 h-5 mb-1.5', mode === key ? 'text-primary' : 'text-muted-foreground')} />
              <div className="text-sm font-semibold">{label}</div>
              <div className="text-xs text-muted-foreground">{sub}</div>
            </button>
          ))}
        </div>
      )}
      {mode === 'PROMOTER'
        ? <GoogleButton redirectTo={next} label="Promoter sign in with Google" />
        : mode === 'CONSUMER'
          ? <GoogleButton redirectTo={next} />
          : null}
      <div className="space-y-1.5">
        <Label htmlFor="email">{mode === 'PROMOTER' ? 'Promoter email' : mode === 'PARTNER' ? 'Partner email' : 'Email'}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <PasswordField id="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
        <p className="text-right text-sm"><Link href="/forgot-password" className="text-primary font-medium hover:underline">Forgot password</Link></p>
      </div>
      {created && !error && <p className="text-sm text-foreground" role="status">You’re in. Sign in with the email and password you just picked, and peek at your inbox to verify the address.</p>}
      {params.get('reset') === '1' && !error && <p className="text-sm text-foreground" role="status">Password updated. Sign in with the new one.</p>}
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="w-full h-11" disabled={loading}>
        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{mode === 'PROMOTER' ? 'Promoter sign in' : mode === 'PARTNER' ? 'Partner sign in' : 'Sign in'}
      </Button>

      {mode === 'PARTNER' ? (
        <p className="text-sm text-muted-foreground text-center">Partner logins are created by VibePeep. There is no public sign-up.</p>
      ) : mode === 'PROMOTER' ? (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-sm font-semibold">Promotion packages</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {TIERS.map((t) => (
              <div key={t.key} className="rounded-lg bg-background border border-border p-2 text-center">
                <span className="block h-1 w-6 mx-auto rounded-full mb-1.5" style={{ backgroundColor: t.color }} />
                <p className="text-xs font-semibold">{t.name}</p>
                <p className="text-[11px] text-muted-foreground">from {formatAud(t.prices[7])}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Plus boosts and {PRO_PLAN.name} ({PRO_PLAN.discountPct}% off everything).</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/promoters" className="text-primary font-medium hover:underline">See packages & pricing</Link>
            <Link href="/signup?role=promoter" className="text-primary font-medium hover:underline">Create a promoter account</Link>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center">
          New here? <Link href={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-primary font-medium hover:underline">Create an account</Link>
        </p>
      )}
      {mode !== 'PARTNER' && (
        <p className="text-center text-sm">
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode('PARTNER')}>Source partner sign in</button>
        </p>
      )}
    </form>
  )
}

export default function LoginPage() {
  return (
    <AuthShell title="Back for more?" subtitle="Sign in and pick up where you left off.">
      <Suspense fallback={null}><LoginForm /></Suspense>
    </AuthShell>
  )
}
