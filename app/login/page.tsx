'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { establishSession } from '@/lib/establish-session'
import { Loader2, Megaphone, Ticket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PRO_PLAN, TIERS, formatAud } from '@/lib/tiers'
import { AuthShell } from '@/components/auth-shell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { GoogleButton } from '@/components/google-button'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const nextParam = params.get('next')
  const [mode, setMode] = useState<'CONSUMER' | 'PROMOTER'>(params.get('as') === 'promoter' || nextParam?.startsWith('/promoter') ? 'PROMOTER' : 'CONSUMER')
  const next = nextParam || (mode === 'PROMOTER' ? '/promoter' : '/')
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
    { key: 'CONSUMER' as const, label: 'Event-goer', sub: 'Saved events & emails', Icon: Ticket },
    { key: 'PROMOTER' as const, label: 'Promoter', sub: 'Dashboard & packages', Icon: Megaphone },
  ]

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
      {mode === 'PROMOTER'
        ? <GoogleButton redirectTo="/promoter" label="Promoter sign in with Google" />
        : <GoogleButton redirectTo="/" />}
      <div className="space-y-1.5">
        <Label htmlFor="email">{mode === 'PROMOTER' ? 'Promoter email' : 'Email'}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
      </div>
      {created && !error && <p className="text-sm text-foreground" role="status">Account created. Sign in with the email and password you just chose.</p>}
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="w-full h-11" disabled={loading}>
        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{mode === 'PROMOTER' ? 'Sign In to Promoter Dashboard' : 'Sign In'}
      </Button>

      {mode === 'PROMOTER' ? (
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
          New here? <Link href={`/signup${nextParam && nextParam !== '/' ? `?next=${encodeURIComponent(nextParam)}` : ''}`} className="text-primary font-medium hover:underline">Create an account</Link>
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
