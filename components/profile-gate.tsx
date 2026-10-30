'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ProfileFields } from '@/components/profile-fields'
import { isPostcode, parseBirthYear } from '@/lib/profile-shared'

const OPEN_PATHS = ['/privacy', '/how-listings-work', '/disclaimer', '/login', '/signup']

/** A birth year is mandatory for event-goers: anyone signed in without one (e.g. Google sign-ups, older accounts) is asked for it. */
export function ProfileGate() {
  const { data: session, status } = useSession() || {}
  const pathname = usePathname()
  const [needed, setNeeded] = useState(false)
  const [birthYear, setBirthYear] = useState('')
  const [homePostcode, setHomePostcode] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const uid = session?.user?.id

  useEffect(() => {
    if (status !== 'authenticated' || !uid) { setNeeded(false); return }
    let live = true
    fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then((d) => {
      const u = d?.user
      if (!live || !u) return
      setNeeded(u.role === 'CONSUMER' && !u.birthYear)
      if (u.homePostcode) setHomePostcode(u.homePostcode)
    }).catch((err) => console.error('Profile check failed:', err))
    return () => { live = false }
  }, [status, uid])

  if (!needed || OPEN_PATHS.some((p) => pathname?.startsWith(p))) return null

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const p = parseBirthYear(birthYear)
    if (p.error) { setError(p.error); return }
    if (homePostcode && !isPostcode(homePostcode)) { setError('Postcodes are 4 digits'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ birthYear, homePostcode }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d?.error ?? 'Could not save'); return }
      setNeeded(false); toast.success('Sorted. Now go take a peep.')
    } catch (err) { console.error('Profile save failed:', err); setError('Could not save. Please try again.') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="profile-gate-title">
      <form onSubmit={save} className="w-full max-w-md rounded-2xl bg-card shadow-2xl p-6 space-y-4">
        <div>
          <h2 id="profile-gate-title" className="font-display text-2xl font-bold">One quick thing before the fun</h2>
          <p className="text-sm text-muted-foreground mt-1">We need the year you were born to finish setting up your account. We don’t ask for the day. Postcode is optional.</p>
        </div>
        <ProfileFields idPrefix="gate" birthYear={birthYear} homePostcode={homePostcode} onBirthYear={setBirthYear} onPostcode={setHomePostcode} />
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" className="w-full h-11" disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save and Continue</Button>
        <button type="button" onClick={() => signOut({ redirectTo: '/' })} className="w-full text-xs text-muted-foreground hover:text-foreground">Sign out instead</button>
      </form>
    </div>
  )
}
