'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Calendar, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSaved } from '@/lib/saved'
import { eventsToIcs } from '@/lib/ics'
import { eventPath } from '@/lib/seo'

type Venue = { venueKey: string; venueName: string; city: string | null }

export function WatchlistClient() {
  const { data: session, status } = useSession() || {}
  const { saved } = useSaved()
  const [tags, setTags] = useState<string[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [reminderOptIn, setReminderOptIn] = useState(false)
  const [emailOptIn, setEmailOptIn] = useState(false)
  const [emailFrequency, setEmailFrequency] = useState('weekly')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancel = false
    fetch('/api/me/follows').then((r) => r.json()).then((d) => {
      if (cancel) return
      setTags(d?.tags ?? [])
      setVenues(d?.venues ?? [])
      setReminderOptIn(!!d?.reminderOptIn)
      setEmailOptIn(!!d?.emailOptIn)
      setEmailFrequency(d?.emailFrequency ?? 'weekly')
    }).catch(() => {}).finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [status])

  const patchMe = async (body: object) => {
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) { toast.error('Oops, that one didn’t land. Give it another go.'); return false }
    return true
  }

  const download = async () => {
    let body = ''
    if (session?.user) {
      const res = await fetch('/api/me/calendar')
      if (!res.ok) { toast.error('Oops, the calendar didn’t land. Give it another go.'); return }
      body = await res.text()
    } else {
      body = eventsToIcs(saved.map((ev) => ({
        id: ev.id, title: ev.title, date: ev.date, endDate: ev.endDate, time: ev.time, endTime: ev.endTime,
        venueName: ev.venueName, city: ev.city,
        url: ev.href?.startsWith('http') ? ev.href : `${window.location.origin}${ev.href ?? eventPath(ev)}`,
      })), { calendarName: 'My VibePeep' })
    }
    const blob = new Blob([body], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'my-vibepeep.ics'
    a.click()
    URL.revokeObjectURL(url)
  }

  const unfollowTag = async (tag: string) => {
    const res = await fetch('/api/me/follows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'tag', value: tag, follow: false }) })
    if (res.ok) setTags((list) => list.filter((item) => item !== tag))
  }
  const unfollowVenue = async (venue: Venue) => {
    const res = await fetch('/api/me/follows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'venue', value: venue.venueName, city: venue.city, follow: false }) })
    if (res.ok) setVenues((list) => list.filter((item) => item.venueKey !== venue.venueKey))
  }

  const preview = async () => {
    const res = await fetch('/api/me/watchlist-preview', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) toast.error(data?.error ?? 'Oops, that one didn’t land. Give it another go.')
    else toast.success('Preview’s in your inbox. Have a peep.')
  }

  return (
    <main className="vp-wrap px-4 py-8 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">My VibePeep</p>
      <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Your keepers, plus what you follow.</h1>
      <p className="mt-3 text-muted-foreground">Saves live on your account, so sign in and we’ll keep them. Follow a venue or an interest and I’ll email new matches. Reminders are a separate yes.</p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={download} className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2">
          <Calendar className="w-4 h-4" />Add to My Calendar
        </button>
        <Link href="/saved" className="h-10 px-4 rounded-md border border-border text-sm font-semibold inline-flex items-center">See the keepers</Link>
        <Link href="/together" className="h-10 px-4 rounded-md border border-border text-sm font-semibold inline-flex items-center">Plan with your crew</Link>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-display text-xl font-bold">Following</h2>
        {status !== 'authenticated' && (
          <p className="mt-2 text-sm text-muted-foreground">
            <Link href="/login?next=/watchlist" className="text-primary underline">Sign in</Link> and you can follow venues and interests, and turn email on.
          </p>
        )}
        {loading && status === 'authenticated' && <Loader2 className="mt-3 w-5 h-5 animate-spin text-primary" />}
        {status === 'authenticated' && !loading && (
          <>
            <h3 className="mt-4 text-sm font-semibold">Interests</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button key={tag} type="button" onClick={() => unfollowTag(tag)} className="px-3 h-9 rounded-full bg-primary text-primary-foreground text-sm">{tag} · Unfollow</button>
              ))}
              {!tags.length && <p className="text-sm text-muted-foreground">No interests yet. Follow one from an event, or pick them in your account.</p>}
            </div>
            <h3 className="mt-4 text-sm font-semibold">Venues</h3>
            <ul className="mt-2 space-y-2">
              {venues.map((venue) => (
                <li key={venue.venueKey} className="flex items-center justify-between gap-3 text-sm">
                  <span>{venue.venueName}{venue.city ? ` · ${venue.city}` : ''}</span>
                  <button type="button" onClick={() => unfollowVenue(venue)} className="text-muted-foreground hover:text-foreground">Unfollow</button>
                </li>
              ))}
              {!venues.length && <li className="text-sm text-muted-foreground">No venues yet. Follow one from its event page.</li>}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-display text-xl font-bold">Email</h2>
        <p className="text-sm text-muted-foreground">No app pings. Mail only goes out when you say yes, and email is switched on.</p>
        {status === 'authenticated' ? (
          <>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 accent-[hsl(var(--primary))]" checked={emailOptIn} onChange={async (e) => {
                const next = e.target.checked
                if (await patchMe({ emailOptIn: next })) setEmailOptIn(next)
              }} />
              <span>Please send me a note ({emailFrequency}). I’ll round up upcoming keepers and new events at venues you follow. Your interests shape the VibePeep email too.</span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 accent-[hsl(var(--primary))]" checked={reminderOptIn} onChange={async (e) => {
                const next = e.target.checked
                if (await patchMe({ reminderOptIn: next })) setReminderOptIn(next)
              }} />
              <span>Please nudge me when a saved event is about a day away. This sits apart from the regular note.</span>
            </label>
            <button type="button" onClick={preview} className="h-9 px-4 rounded-md border border-border text-sm hover:bg-muted">Send me a preview</button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sign in to say yes. Reminders and the note live on your account.</p>
        )}
      </section>
      </div>
    </main>
  )
}
