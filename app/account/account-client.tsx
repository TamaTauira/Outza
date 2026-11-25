'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Calendar, Loader2 } from 'lucide-react'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { CATEGORIES } from '@/lib/categories'
import { CITIES } from '@/lib/cities'
import { ProfileFields } from '@/components/profile-fields'
import { aboutYouStatus, profileDigits, visibleAboutErrors } from '@/lib/profile-shared'
import { VibeCard } from './vibe-card'
import { eventsToIcs, SAVED_ICS_FILENAME } from '@/lib/ics'
import { eventPath } from '@/lib/seo'
import { useSaved } from '@/lib/saved'
import { PasswordField } from '@/components/password-field'
import { BrandedLoading } from '@/components/branded-loading'
import { PageHeading } from '@/components/page-heading'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'

type Me = { id?: string; name?: string | null; email: string; image?: string | null; role?: string; orgName?: string | null; bio?: string | null; website?: string | null; birthYear?: number | null; homePostcode?: string | null; homeCity?: string | null; vibeProfile?: unknown; preferredCategories: string[]; preferredCities: string[]; emailOptIn: boolean; emailFrequency: string; emailActivityPersonalisation?: boolean; reminderOptIn?: boolean }
type Person = { friendshipId: string; id: string; name: string | null; email: string }

const card = 'min-w-0 w-full max-w-full rounded-card border border-border bg-card p-card-lg shadow-vp-sm'

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
  const [year, setYear] = useState('')
  const [pc, setPc] = useState('')
  const [yearTouched, setYearTouched] = useState(false)
  const yearRef = useRef<HTMLInputElement>(null)
  const pcRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)
  const loadedAbout = useRef({ year: '', pc: '' })
  useEffect(() => {
    if (!me) return
    const nextYear = me.birthYear == null ? '' : String(me.birthYear)
    const nextPc = me.homePostcode ?? ''
    setYear((cur) => (cur === loadedAbout.current.year ? nextYear : cur))
    setPc((cur) => (cur === loadedAbout.current.pc ? nextPc : cur))
    loadedAbout.current = { year: nextYear, pc: nextPc }
  }, [me])
  const saveAbout = async () => {
    if (!me || savingRef.current) return
    // Read the inputs themselves. On iOS the tap that leaves the field can land
    // before React state catches the last digit or an autofill.
    const yearNow = profileDigits(yearRef.current?.value ?? year, 4)
    const pcNow = profileDigits(pcRef.current?.value ?? pc, 4)
    const yearRequired = me.role === 'CONSUMER'
    const check = aboutYouStatus(yearNow, pcNow, { yearRequired })
    if (yearNow !== year) setYear(yearNow)
    if (pcNow !== pc) setPc(pcNow)
    if (!check.canSave) { setYearTouched(true); return }
    savingRef.current = true
    setSaving(true)
    try {
      const body: { birthYear?: number; homePostcode: string } = { homePostcode: pcNow }
      if (check.year != null) body.birthYear = check.year
      const res = await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof d?.error === 'string' ? d.error : 'Could not save')
      const again = await fetch('/api/me')
      const fresh = again.ok ? await again.json().catch(() => null) : null
      const savedUser = fresh?.user ?? d.user
      if (!savedUser) throw new Error('Could not save')
      if (check.year != null && Number(savedUser.birthYear) !== check.year) throw new Error('Could not save')
      const savedPc = typeof savedUser.homePostcode === 'string' ? savedUser.homePostcode : ''
      if (savedPc !== pcNow) throw new Error('Could not save')
      const savedYear = savedUser.birthYear == null ? '' : String(savedUser.birthYear)
      loadedAbout.current = { year: savedYear, pc: savedPc }
      setYear(savedYear)
      setPc(savedPc)
      setMe((m) => (m ? { ...m, ...savedUser, birthYear: savedYear ? Number(savedYear) : null, homePostcode: savedPc || null } : m))
      toast.success('Details saved')
    } catch (err) { console.error(err); toast.error(err instanceof Error ? err.message : 'Could not save') } finally { savingRef.current = false; setSaving(false) }
  }
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const friendAction = async (body: object, method = 'PATCH') => {
    const res = await fetch('/api/friends', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || d?.ok === false) toast.error(d?.error ?? 'Something went wrong'); else toast.success(d?.message ?? 'Done')
    load()
  }
  const preview = async () => {
    const res = await fetch('/api/me/digest-preview', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) toast.success('City digest preview sent to your inbox')
    else toast.error(typeof data?.error === 'string' ? data.error : 'Could not send preview')
  }
  const watchPreview = async () => {
    const res = await fetch('/api/me/watchlist-preview', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) toast.success('Preview sent to your inbox')
    else toast.error(typeof data?.error === 'string' ? data.error : 'Could not send preview')
  }

  if (!me) return <BrandedLoading label="Getting your account ready" />

  const promoter = me.role === 'PROMOTER' || me.role === 'ADMIN'
  const yearRequired = me.role === 'CONSUMER'
  const about = aboutYouStatus(year, pc, { saving, yearRequired })
  const shown = visibleAboutErrors(year, pc, { yearRequired, yearTouched })

  return (
    <main className="vp-wrap vp-page-top min-w-0 overflow-x-clip px-4 pb-6 sm:px-6 sm:pb-8">
      {promoter ? <Link href="/promoter" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Promoter dashboard</Link> : <BackToEventsLink className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to events</BackToEventsLink>}
      <div className="mt-4">
        <PageHeading>{promoter ? 'Promoter settings' : 'Your account'} {saving && <Loader2 className="inline h-5 w-5 animate-spin text-primary" />}</PageHeading>
        <p className="text-sm text-muted-foreground mt-1 break-all">{me.email}</p>
      </div>
      <div className="vp-card-grid mt-[var(--vp-card-gap)] min-w-0 items-start lg:grid-cols-2">

      {!promoter && <section className={`${card} lg:col-span-2`}>
        <h2 className="font-semibold mb-1">About you</h2>
        <p className="text-xs text-muted-foreground mb-3">{yearRequired ? 'Year of birth keeps things fair for event-goers. We don’t store the day. Postcode is your call.' : 'Optional for promoter accounts.'}</p>
        <form noValidate onSubmit={(e) => { e.preventDefault(); void saveAbout() }}>
          <ProfileFields idPrefix="acct" birthYear={year} homePostcode={pc} onBirthYear={setYear} onPostcode={setPc} showNote={false} yearRequired={yearRequired} yearError={shown.yearError} postcodeError={shown.postcodeError} onBirthYearBlur={() => setYearTouched(true)} onEnter={() => { void saveAbout() }} yearRef={yearRef} postcodeRef={pcRef} />
          {/* pointer-events-none while disabled lets the same tap read the inputs. iOS can commit the last digit on blur after the button has already ignored the click. */}
          <span className="inline-flex" onClick={() => { void saveAbout() }}>
            <Button type="button" disabled={!about.canSave} className="mt-3">{saving ? 'Saving…' : 'Save details'}</Button>
          </span>
        </form>
      </section>}

      {!promoter && <div className="lg:col-span-2"><VibeCard initial={me.vibeProfile} onSaved={(v) => setMe((m) => (m ? { ...m, vibeProfile: v } : m))} /></div>}

      {promoter && <div className="lg:col-span-2"><PromoterProfile me={me} onSaved={(patch) => setMe((m) => (m ? { ...m, ...patch } : m))} /></div>}

      {!promoter && <section className={`${card} lg:col-span-2`}>
        <label htmlFor="acct-city" className="font-semibold block mb-3">Home city</label>
        <select id="acct-city" value={me.homeCity ?? ''} onChange={(e) => save({ homeCity: e.target.value })} className="h-control w-full rounded-control border border-border bg-background px-3 text-base sm:w-auto">
          {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}, {c.state}</option>)}
        </select>
        <h2 className="font-semibold mt-5 mb-1">What’s your thing?</h2>
        <p className="text-xs text-muted-foreground mb-3">We’ll use this when we write to you.</p>
        <div className="flex flex-wrap gap-2">{CATEGORIES.map((c) => <Chip key={c.name} pressed={(me.preferredCategories ?? []).includes(c.name)} onClick={() => save({ preferredCategories: toggleIn(me.preferredCategories ?? [], c.name) })}>{c.name}</Chip>)}</div>
        <h2 className="font-semibold mt-5 mb-3">Cities to include</h2>
        <div className="flex flex-wrap gap-2">{CITIES.map((c) => <Chip key={c.name} pressed={(me.preferredCities ?? []).includes(c.name)} onClick={() => save({ preferredCities: toggleIn(me.preferredCities ?? [], c.name) })}>{c.name}</Chip>)}</div>
      </section>}

      {!promoter && <FollowsCard />}

      {!promoter && <section id="inbox" className={card}>
        <h2 className="font-semibold mb-1">Email</h2>
        <p className="mb-3 text-sm text-muted-foreground">One place for the daily note, the day-before nudge, and a preview. Nothing is sent until you tick a box.</p>
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={me.emailOptIn} onChange={(e) => save({ emailOptIn: e.target.checked })} className="mt-1 w-4 h-4 accent-[hsl(var(--primary))]" />
          <span>Send me a note ({(me.emailFrequency || 'weekly').toLowerCase()}). I’ll round up upcoming keepers and new events at venues you follow.</span>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {['daily', 'weekly', 'monthly'].map((f) => <Chip key={f} type="button" disabled={!me.emailOptIn} pressed={me.emailFrequency?.toLowerCase() === f} onClick={() => save({ emailFrequency: f })} className="disabled:opacity-40">{f[0].toUpperCase() + f.slice(1)}</Chip>)}
        </div>
        <label className="mt-4 flex items-start gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={!!me.reminderOptIn} onChange={(e) => save({ reminderOptIn: e.target.checked })} className="mt-1 w-4 h-4 accent-[hsl(var(--primary))]" />
          <span>Nudge me the day before a saved event. Off until you tick it, and only when the note is switched on.</span>
        </label>
        <label className="mt-4 flex items-start gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={me.emailActivityPersonalisation !== false} onChange={(e) => save({ emailActivityPersonalisation: e.target.checked })} className="mt-1 w-4 h-4 accent-[hsl(var(--primary))]" />
          <span>Personalise using my email activity. When this is off, newsletter opens and link clicks are not stored and are not used to rank later picks.</span>
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => { void watchPreview() }} className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted">Send me a preview</button>
          <button type="button" onClick={preview} className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted">Preview the city digest</button>
        </div>
      </section>}

      {!promoter && <section className={card}>
        <h2 className="font-semibold mb-3">Friends</h2>
        <form onSubmit={(e) => { e.preventDefault(); if (friendEmail) { friendAction({ email: friendEmail }, 'POST'); setFriendEmail('') } }} className="flex gap-2">
          <Input type="email" value={friendEmail} onChange={(e) => setFriendEmail(e.target.value)} placeholder="Friend's email" aria-label="Friend's email" className="min-w-0 flex-1" />
          <Button>Add</Button>
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
      </section>}

      <div className="lg:col-span-2"><SecurityCard email={me.email} /></div>
      </div>
    </main>
  )
}

function PromoterProfile({ me, onSaved }: { me: Me; onSaved: (patch: Partial<Me>) => void }) {
  const [orgName, setOrgName] = useState(me.orgName ?? '')
  const [bio, setBio] = useState(me.bio ?? '')
  const [website, setWebsite] = useState(me.website ?? '')
  const [image, setImage] = useState(me.image ?? '')
  const [busy, setBusy] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orgName, bio, website, image }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Could not save')
      onSaved({ orgName, bio, website, image })
      toast.success('Promoter profile saved')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not save') } finally { setBusy(false) }
  }
  return (
    <section className={card}>
      <h2 className="font-semibold mb-1">Promoter profile</h2>
      <p className="text-xs text-muted-foreground mb-3">This is what people see on your public organiser page.</p>
      <form onSubmit={save} className="space-y-3">
        <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organisation name" aria-label="Organisation name" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" />
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short bio" aria-label="Bio" rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website (https://…)" aria-label="Website" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" />
        <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="Logo image link (https://…)" aria-label="Logo" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" />
        <Button disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button>
      </form>
      {me.id && <p className="mt-3 text-xs text-muted-foreground">Public page: <Link href={`/organisers/${me.id}`} className="underline">your organiser page</Link> is linked from each event you present.</p>}
    </section>
  )
}

function FollowsCard() {
  const { saved } = useSaved()
  const [tags, setTags] = useState<string[]>([])
  const [venues, setVenues] = useState<{ venueKey: string; venueName: string; city: string | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancel = false
    fetch('/api/me/follows').then((r) => r.json()).then((d) => {
      if (cancel) return
      setTags(d?.tags ?? [])
      setVenues(d?.venues ?? [])
    }).catch(() => {}).finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [])

  const unfollowTag = async (tag: string) => {
    const res = await fetch('/api/me/follows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'tag', value: tag, follow: false }) })
    if (res.ok) setTags((list) => list.filter((item) => item !== tag))
    else toast.error('Could not unfollow that')
  }
  const unfollowVenue = async (venue: { venueKey: string; venueName: string; city: string | null }) => {
    const res = await fetch('/api/me/follows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'venue', value: venue.venueName, city: venue.city, follow: false }) })
    if (res.ok) setVenues((list) => list.filter((item) => item.venueKey !== venue.venueKey))
    else toast.error('Could not unfollow that')
  }
  const download = async () => {
    const res = await fetch('/api/me/calendar')
    const body = res.ok ? await res.text() : eventsToIcs(saved.map((ev) => ({
      id: ev.id, title: ev.title, date: ev.date, endDate: ev.endDate, time: ev.time, endTime: ev.endTime,
      venueName: ev.venueName, city: ev.city,
      url: ev.href?.startsWith('http') ? ev.href : `${window.location.origin}${ev.href ?? eventPath(ev)}`,
    })), { calendarName: 'VibePeep' })
    if (!body) { toast.error('The calendar didn’t land. Give it another go.'); return }
    const blob = new Blob([body], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = SAVED_ICS_FILENAME
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section id="following" className={`${card} lg:col-span-2`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Following</h2>
          <p className="mt-1 text-sm text-muted-foreground">Interests and venues you follow. Saved events stay on <Link href="/saved" className="text-primary underline">Saved</Link>.</p>
        </div>
        <button type="button" onClick={() => { void download() }} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted">
          <Calendar className="h-4 w-4" />Add to my calendar
        </button>
      </div>
      {loading ? <Loader2 className="mt-3 h-5 w-5 animate-spin text-primary" /> : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Interests</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Button key={tag} type="button" size="sm" onClick={() => { void unfollowTag(tag) }}>{tag} · Unfollow</Button>
              ))}
              {!tags.length && <p className="text-sm text-muted-foreground">No interests yet. Follow one from an event.</p>}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Venues</h3>
            <ul className="mt-2 space-y-2">
              {venues.map((venue) => (
                <li key={venue.venueKey} className="flex items-center justify-between gap-3 text-sm">
                  <span>{venue.venueName}{venue.city ? ` · ${venue.city}` : ''}</span>
                  <button type="button" onClick={() => { void unfollowVenue(venue) }} className="rounded-full border border-border px-3 py-1 text-sm hover:bg-muted">Unfollow</button>
                </li>
              ))}
              {!venues.length && <li className="text-sm text-muted-foreground">No venues yet. Follow one from its event page.</li>}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

function SecurityCard({ email }: { email: string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const change = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/me/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ current, next }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Could not change password')
      setCurrent(''); setNext('')
      toast.success('Password updated')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not change password') } finally { setBusy(false) }
  }
  const close = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.confirm('Close this account permanently? Your listings stay on the site without an owner.')) return
    setBusy(true)
    try {
      const res = await fetch('/api/me/close', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Could not close account')
      window.location.href = '/'
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not close account'); setBusy(false) }
  }
  return (
    <section className={card}>
      <h2 className="font-semibold mb-3">Password</h2>
      <form onSubmit={change} className="space-y-2">
        <PasswordField value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" aria-label="Current password" autoComplete="current-password" className="h-10" />
        <PasswordField value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" aria-label="New password" autoComplete="new-password" className="h-10" />
        <button disabled={busy} className="h-9 px-4 rounded-md border border-border text-sm font-semibold hover:bg-muted disabled:opacity-60">Change password</button>
      </form>
      <h2 className="font-semibold mt-6 mb-1">Close account</h2>
      <p className="text-xs text-muted-foreground mb-2">Type {email} to permanently delete this login. Closing the account does not by itself refund a purchase. Refund rights are on the <Link href="/refunds" className="underline">refunds page</Link>, including under the Australian Consumer Law.</p>
      <form onSubmit={close} className="flex flex-col sm:flex-row gap-2">
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={email} aria-label="Confirm email to close account" className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm" />
        <button disabled={busy || confirm.trim().toLowerCase() !== email.toLowerCase()} className="h-10 px-4 rounded-md border border-destructive text-destructive text-sm font-semibold disabled:opacity-40">Close account</button>
      </form>
    </section>
  )
}
