'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { CATEGORIES } from '@/lib/categories'
import { CITIES } from '@/lib/cities'
import { cn } from '@/lib/utils'
import { ProfileFields } from '@/components/profile-fields'
import { isPostcode, parseBirthDate } from '@/lib/profile-shared'
import { VibeCard } from './vibe-card'

type Me = { name?: string | null; email: string; role?: string; birthDate?: string | null; homePostcode?: string | null; homeCity?: string | null; vibeProfile?: unknown; preferredCategories: string[]; preferredCities: string[]; emailOptIn: boolean; emailFrequency: string; reminderOptIn?: boolean }
type Person = { friendshipId: string; id: string; name: string | null; email: string }

const card = 'rounded-xl bg-card border border-border p-5 shadow-sm'
const chip = (on: boolean) => cn('px-3 min-h-9 py-1.5 rounded-full text-xs border transition-colors', on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')

export function AccountClient() {
  const [me, setMe] = useState<Me | null>(null)
  const [friends, setFriends] = useState<{ friends: Person[]; incoming: Person[]; outgoing: Person[] }>({ friends: [], incoming: [], outgoing: [] })
  const [friendEmail, setFriendEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [m, f] = await Promise.all([fetch('/api/me').then((r) => r.json()), fetch('/api/friends').then((r) => r.json())])
      setMe(m?.user ?? m)
      setFriends({ friends: f?.friends ?? [], incoming: f?.incoming ?? [], outgoing: f?.outgoing ?? [] })
    } catch (err) { console.error('Failed to load account:', err) }
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (patch: Partial<Me>) => {
    if (!me) return
    setMe({ ...me, ...patch }); setSaving(true)
    try {
      const res = await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) })
      if (!res.ok) throw new Error('save failed')
      toast.success('Preferences saved')
    } catch (err) { console.error(err); toast.error('Could not save') } finally { setSaving(false) }
  }
  const [dob, setDob] = useState('')
  const [pc, setPc] = useState('')
  const loadedAbout = useRef({ dob: '', pc: '' })
  useEffect(() => {
    if (!me) return
    const nextDob = (me.birthDate ?? '').slice(0, 10)
    const nextPc = me.homePostcode ?? ''
    setDob((cur) => (cur === loadedAbout.current.dob ? nextDob : cur))
    setPc((cur) => (cur === loadedAbout.current.pc ? nextPc : cur))
    loadedAbout.current = { dob: nextDob, pc: nextPc }
  }, [me])
  const saveAbout = async () => {
    const p = parseBirthDate(dob)
    if (p.error) { toast.error(p.error); return }
    if (pc && !isPostcode(pc)) { toast.error('Postcodes are 4 digits'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ birthDate: dob, homePostcode: pc }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Could not save')
      const savedDob = (d.user?.birthDate ?? dob).slice(0, 10)
      const savedPc = d.user?.homePostcode ?? ''
      loadedAbout.current = { dob: savedDob, pc: savedPc }
      setDob(savedDob)
      setPc(savedPc)
      setMe((m) => (m ? { ...m, birthDate: savedDob, homePostcode: savedPc || null } : m))
      toast.success('Details saved')
    } catch (err) { console.error(err); toast.error(err instanceof Error ? err.message : 'Could not save') } finally { setSaving(false) }
  }
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const friendAction = async (body: object, method = 'PATCH') => {
    const res = await fetch('/api/friends', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) toast.error(d?.error ?? 'Something went wrong'); else toast.success(d?.message ?? 'Done')
    load()
  }
  const preview = async () => {
    const res = await fetch('/api/me/digest-preview', { method: 'POST' })
    if (res.ok) toast.success('Preview sent to your inbox'); else toast.error('Could not send preview')
  }

  if (!me) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-5">
      <BackToEventsLink className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to events</BackToEventsLink>
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold">My account &amp; emails {saving && <Loader2 className="inline w-5 h-5 animate-spin text-primary" />}</h1>
        <p className="text-sm text-muted-foreground mt-1 break-all">{me.email}</p>
      </div>

      <section className={card}>
        <h2 className="font-semibold mb-1">About you</h2>
        <p className="text-xs text-muted-foreground mb-3">{me.role === 'CONSUMER' ? 'Date of birth is required for event-goer accounts. Postcode is up to you.' : 'Optional for promoter accounts.'}</p>
        <ProfileFields idPrefix="acct" birthDate={dob} homePostcode={pc} onBirthDate={setDob} onPostcode={setPc} showNote={false} />
        <button onClick={saveAbout} disabled={saving || (dob.slice(0, 10) === (me.birthDate ?? '').slice(0, 10) && pc.trim() === (me.homePostcode ?? ''))} className="mt-3 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">Save Details</button>
      </section>

      <VibeCard initial={me.vibeProfile} onSaved={(v) => setMe((m) => (m ? { ...m, vibeProfile: v } : m))} />

      <section className={card}>
        <label htmlFor="acct-city" className="font-semibold block mb-3">Home city</label>
        <select id="acct-city" value={me.homeCity ?? ''} onChange={(e) => save({ homeCity: e.target.value })} className="h-11 w-full sm:w-auto rounded-md border border-border bg-background px-3 text-sm">
          {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}, {c.state}</option>)}
        </select>
        <h2 className="font-semibold mt-5 mb-1">What’s your thing?</h2>
        <p className="text-xs text-muted-foreground mb-3">We’ll use this to fill your inbox with good stuff.</p>
        <div className="flex flex-wrap gap-2">{CATEGORIES.map((c) => <button key={c.name} onClick={() => save({ preferredCategories: toggleIn(me.preferredCategories ?? [], c.name) })} className={chip((me.preferredCategories ?? []).includes(c.name))}>{c.name}</button>)}</div>
        <h2 className="font-semibold mt-5 mb-3">Cities to include</h2>
        <div className="flex flex-wrap gap-2">{CITIES.map((c) => <button key={c.name} onClick={() => save({ preferredCities: toggleIn(me.preferredCities ?? [], c.name) })} className={chip((me.preferredCities ?? []).includes(c.name))}>{c.name}</button>)}</div>
      </section>

      <section className={card}>
        <h2 className="font-semibold mb-3">Email digest</h2>
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={me.emailOptIn} onChange={(e) => save({ emailOptIn: e.target.checked })} className="w-4 h-4 accent-[hsl(var(--primary))]" />
          Send me events I&apos;d like
        </label>
        <div className="flex flex-wrap gap-2 mt-3">
          {['daily', 'weekly', 'monthly'].map((f) => <button key={f} disabled={!me.emailOptIn} onClick={() => save({ emailFrequency: f })} className={cn(chip(me.emailFrequency?.toLowerCase() === f), 'disabled:opacity-40')}>{f[0].toUpperCase() + f.slice(1)}</button>)}
        </div>
        <button onClick={preview} className="mt-4 h-9 px-4 rounded-md border border-border text-sm hover:bg-muted">Show Me a Sneak Peek</button>
        <label className="flex items-start gap-3 text-sm mt-4 cursor-pointer">
          <input type="checkbox" checked={!!me.reminderOptIn} onChange={(e) => save({ reminderOptIn: e.target.checked })} className="mt-1 w-4 h-4 accent-[hsl(var(--primary))]" />
          <span>Remind me by email when a saved event is coming up. This stays off until you tick it, and it only sends when Resend is configured.</span>
        </label>
        <p className="mt-3 text-sm text-muted-foreground">Saves, venue follows and the calendar file live on <Link href="/watchlist" className="text-primary underline">My Outza</Link>.</p>
      </section>

      <section className={card}>
        <h2 className="font-semibold mb-3">Friends</h2>
        <form onSubmit={(e) => { e.preventDefault(); if (friendEmail) { friendAction({ email: friendEmail }, 'POST'); setFriendEmail('') } }} className="flex gap-2">
          <input type="email" value={friendEmail} onChange={(e) => setFriendEmail(e.target.value)} placeholder="Friend's email" className="flex-1 min-w-0 h-10 rounded-md border border-border bg-background px-3 text-sm" />
          <button className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold">Add</button>
        </form>
        {friends.incoming.map((p) => (
          <div key={p.friendshipId} className="flex items-center justify-between mt-3 text-sm">
            <span>{p.name || p.email} wants to be friends</span>
            <span className="flex gap-2">
              <button onClick={() => friendAction({ friendshipId: p.friendshipId, action: 'accept' })} className="text-free font-semibold">Accept</button>
              <button onClick={() => friendAction({ friendshipId: p.friendshipId, action: 'decline' })} className="text-muted-foreground">Decline</button>
            </span>
          </div>
        ))}
        {friends.outgoing.map((p) => <p key={p.friendshipId} className="mt-3 text-sm text-muted-foreground">Pending: {p.name || p.email}</p>)}
        {friends.friends.map((p) => (
          <div key={p.friendshipId} className="flex items-center justify-between mt-3 text-sm">
            <span className="min-w-0 truncate">{p.name || p.email}</span>
            <button onClick={() => friendAction({ friendshipId: p.friendshipId, action: 'remove' })} className="text-muted-foreground hover:text-foreground">Remove</button>
          </div>
        ))}
        {!friends.friends.length && <p className="mt-3 text-xs text-muted-foreground">Add friends to see which events they&apos;re going to.</p>}
      </section>

    </main>
  )
}
