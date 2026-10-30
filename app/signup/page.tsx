'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { establishSession } from '@/lib/establish-session'
import { Loader2, Ticket, Megaphone } from 'lucide-react'
import { AuthShell } from '@/components/auth-shell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { CITIES } from '@/lib/cities'
import { cn } from '@/lib/utils'
import { GoogleButton } from '@/components/google-button'
import { isPostcode, parseBirthYear } from '@/lib/profile-shared'
import { ProfileFields } from '@/components/profile-fields'

function SignupForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [role, setRole] = useState<'CONSUMER' | 'PROMOTER'>(params.get('role') === 'promoter' ? 'PROMOTER' : 'CONSUMER')
  const [name, setName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [homeCity, setHomeCity] = useState('Sydney')
  const [birthYear, setBirthYear] = useState('')
  const [homePostcode, setHomePostcode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    if (role === 'CONSUMER') {
      const p = parseBirthYear(birthYear)
      if (p.error) { setError(p.error); return }
      if (homePostcode && !isPostcode(homePostcode)) { setError('Postcodes are 4 digits'); return }
    }
    setLoading(true)
    try {
      const r = await fetch('/api/signup', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, orgName, homeCity, ...(role === 'CONSUMER' ? { birthYear, homePostcode } : {}) }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { setError(data.error || 'Could not create account'); return }
      setNotice('Account created. Signing you in…')
      const ok = await Promise.race([
        establishSession(email.trim().toLowerCase(), password),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 12000)),
      ])
      if (!ok) {
        setNotice('')
        setError('Account created. Sign in with the email and password you just chose.')
        const q = new URLSearchParams({ created: '1', email: email.trim().toLowerCase() })
        const next = params.get('next')
        if (next) q.set('next', next)
        router.push(`/login?${q.toString()}`)
        return
      }
      router.replace(params.get('next') || (role === 'PROMOTER' ? '/promoter' : '/account'))
    } catch (err) {
      console.error(err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const roles = [
    { key: 'CONSUMER' as const, label: 'I go to events', sub: 'Save, follow & get emails', Icon: Ticket },
    { key: 'PROMOTER' as const, label: 'I run events', sub: 'Promote & feature events', Icon: Megaphone },
  ]

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
        {roles.map(({ key, label, sub, Icon }) => (
          <button key={key} type="button" role="radio" aria-checked={role === key} onClick={() => setRole(key)}
            className={cn('rounded-xl border p-3 text-left transition-all',
              role === key ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border hover:bg-muted')}>
            <Icon className={cn('w-5 h-5 mb-1.5', role === key ? 'text-primary' : 'text-muted-foreground')} />
            <div className="text-sm font-semibold">{label}</div>
            <div className="text-xs text-muted-foreground">{sub}</div>
          </button>
        ))}
      </div>
      {role === 'PROMOTER'
        ? <GoogleButton redirectTo="/promoter?google=1" label="Sign up with Google" />
        : <GoogleButton redirectTo="/account" label="Sign up with Google" />}
      <div className="space-y-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" required value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
      </div>
      {role === 'PROMOTER' && (
        <div className="space-y-1.5">
          <Label htmlFor="orgName">Promoter / venue name</Label>
          <Input id="orgName" name="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="h-11" placeholder="e.g. Harbour Nights Presents" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="homeCity">Home city</Label>
        <select id="homeCity" value={homeCity} onChange={(e) => setHomeCity(e.target.value)}
          className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm">
          {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}, {c.state}</option>)}
        </select>
      </div>
      {role === 'CONSUMER' && <ProfileFields birthYear={birthYear} homePostcode={homePostcode} onBirthYear={setBirthYear} onPostcode={setHomePostcode} />}
      {notice && <p className="text-sm text-foreground" role="status">{notice}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="w-full h-11" disabled={loading}>
        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create Account
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        By creating an account you agree to our <Link href="/terms" className="underline hover:text-foreground">terms</Link> and <Link href="/disclaimer" className="underline hover:text-foreground">disclaimer</Link>.
      </p>
      <p className="text-sm text-muted-foreground text-center">
        Already have an account? <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
      </p>
    </form>
  )
}

export default function SignupPage() {
  return (
    <AuthShell title="Get amongst it" subtitle="Free for event-goers. Promoters, step right up.">
      <Suspense fallback={null}><SignupForm /></Suspense>
    </AuthShell>
  )
}
