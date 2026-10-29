'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Bookmark, Calendar, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSaved } from '@/lib/saved'
import { eventsToIcs } from '@/lib/ics'
import { eventPath } from '@/lib/seo'
import { EmptyState } from '@/components/empty-state'

type Venue = { venueKey: string; venueName: string; city: string | null }

export function WatchlistClient() {
  const { data: session, status } = useSession() || {}
  const { saved, toggle, isSaved } = useSaved()
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
    if (!res.ok) { toast.error('Could not save that'); return false }
    return true
  }

  const download = async () => {
    let body = ''
    if (session?.user) {
      const res = await fetch('/api/me/calendar')
      if (!res.ok) { toast.error('Could not build the calendar'); return }
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
    if (!res.ok) toast.error(data?.error ?? 'Could not send the preview')
    else toast.success('Preview sent to your inbox')
  }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">My VibePeep</p>
      <h1 className="font-display text-3xl sm:text-4xl font-bold mt-2">Your keepers, plus what you follow.</h1>
      <p className="mt-3 text-muted-foreground">Saves belong to your account, so sign in to keep them. Follow a venue or an interest and we can email new matches. Reminders are a separate opt-in.</p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={download} className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2">
          <Calendar className="w-4 h-4" />Download Calendar
        </button>
        <Link href="/saved" className="h-10 px-4 rounded-md border border-border text-sm font-semibold inline-flex items-center">Open the Keepers</Link>
        <Link href="/together" className="h-10 px-4 rounded-md border border-border text-sm font-semibold inline-flex items-center">Plan Together</Link>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-xl font-bold mb-3">Saved events</h2>
        {!saved.length && status !== 'loading' && (
          <EmptyState
            title={status === 'authenticated' ? 'Nothing saved yet' : 'Sign in to see your saved events'}
            lede={status === 'authenticated' ? 'Use the bookmark on the board or an event page.' : 'Saves, follows and reminders belong to your account.'}
            action={status === 'authenticated' ? { href: '/', label: 'Browse events' } : { href: '/login?next=/watchlist', label: 'Sign in' }}
            secondary={status === 'authenticated' ? undefined : { href: '/', label: 'Browse events' }}
            examples={['Friday · Outdoor yoga · Rose Bay', 'Saturday · Live music · The Rocks', 'Sunday · Market · Bondi']}
          />
        )}
        <ul className="space-y-2">
          {saved.map((ev) => (
            <li key={ev.id} className="rounded-xl border border-border bg-card px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={ev.href ?? eventPath(ev)} className="font-semibold hover:text-primary">{ev.title}</Link>
                <p className="text-sm text-muted-foreground mt-0.5">{ev.date.slice(0, 10)}{ev.time ? ` · ${ev.time}` : ''} · {ev.venueName}</p>
              </div>
              <button type="button" aria-label="Unsave" onClick={() => isSaved(ev.id) && toggle(ev)} className="text-primary p-1"><Bookmark className="w-4 h-4 fill-current" /></button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-display text-xl font-bold">Following</h2>
        {status !== 'authenticated' && (
          <p className="mt-2 text-sm text-muted-foreground">
            <Link href="/login?next=/watchlist" className="text-primary underline">Sign in</Link> to follow venues and interests, and to turn on email.
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
              {!tags.length && <p className="text-sm text-muted-foreground">Follow an interest from any event page, or pick them in My account.</p>}
            </div>
            <h3 className="mt-4 text-sm font-semibold">Venues</h3>
            <ul className="mt-2 space-y-2">
              {venues.map((venue) => (
                <li key={venue.venueKey} className="flex items-center justify-between gap-3 text-sm">
                  <span>{venue.venueName}{venue.city ? ` · ${venue.city}` : ''}</span>
                  <button type="button" onClick={() => unfollowVenue(venue)} className="text-muted-foreground hover:text-foreground">Unfollow</button>
                </li>
              ))}
              {!venues.length && <li className="text-sm text-muted-foreground">Follow a venue from its event page.</li>}
            </ul>
          </>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <h2 className="font-display text-xl font-bold">Email</h2>
        <p className="text-sm text-muted-foreground">No app notifications. Mail goes out only when you opt in and email is configured.</p>
        {status === 'authenticated' ? (
          <>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 accent-[hsl(var(--primary))]" checked={emailOptIn} onChange={async (e) => {
                const next = e.target.checked
                if (await patchMe({ emailOptIn: next })) setEmailOptIn(next)
              }} />
              <span>Send a watchlist digest ({emailFrequency}). It lists upcoming saves and new events at venues you follow. Interest picks also feed the usual VibePeep newsletter.</span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 accent-[hsl(var(--primary))]" checked={reminderOptIn} onChange={async (e) => {
                const next = e.target.checked
                if (await patchMe({ reminderOptIn: next })) setReminderOptIn(next)
              }} />
              <span>Remind me by email when a saved event is coming up (about a day ahead). This is separate from the digest.</span>
            </label>
            <button type="button" onClick={preview} className="h-9 px-4 rounded-md border border-border text-sm hover:bg-muted">Send Me a Preview</button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sign in to opt in. Reminders and the digest are tied to your account.</p>
        )}
      </section>
    </main>
  )
}
