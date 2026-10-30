'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { VENUE_PRODUCTS, VENUE_REPORT_REASONS, SPONSORED_LABEL } from '@/lib/ownership'

const tabs = ['Overview', 'My Venue', 'Upcoming Events', 'Analytics', 'Promotions', 'Team & Access', 'Settings'] as const
type Tab = (typeof tabs)[number]
const field = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'

type EventRow = {
  id: string
  title: string
  date: string
  time: string | null
  category: string
  status: string
  organiserName: string | null
  canEdit: boolean
  publicPath: string
  imageUrl: string | null
}

export function VenueDashboard({ venueId, name, city, role }: { venueId: string; name: string; city: string; role: string }) {
  const [tab, setTab] = useState<Tab>('Overview')
  const [events, setEvents] = useState<EventRow[]>([])
  const [mineOnly, setMineOnly] = useState(false)
  const [analytics, setAnalytics] = useState<Record<string, number | string> | null>(null)
  const [range, setRange] = useState('30')
  const [members, setMembers] = useState<Array<{ id: string; name: string | null; email: string; role: string; status: string }>>([])
  const [profile, setProfile] = useState({ description: '', announcement: '', contactEmail: '', openingHours: '', categories: '', facilities: '', accessibilityInfo: '', website: '', address: '' })

  useEffect(() => {
    fetch(`/api/venues/${venueId}/events`).then((r) => r.json()).then((d) => setEvents(d.events || [])).catch(() => {})
  }, [venueId])

  useEffect(() => {
    if (tab !== 'Analytics') return
    fetch(`/api/venues/${venueId}/analytics?range=${range}`).then((r) => r.json()).then((d) => setAnalytics(d.analytics || null)).catch(() => {})
  }, [tab, range, venueId])

  useEffect(() => {
    if (tab !== 'Team & Access') return
    fetch(`/api/venues/${venueId}/team`).then((r) => r.json()).then((d) => setMembers(d.members || [])).catch(() => {})
  }, [tab, venueId])

  const shown = mineOnly ? events.filter((event) => event.canEdit) : events

  const save = async (extra?: Record<string, string>) => {
    const res = await fetch(`/api/venues/${venueId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...profile, ...extra }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error || 'Could not save'); return }
    toast.success(data.warning || (data.review?.length ? 'Sensitive changes are waiting for a person to review.' : 'Profile saved.'))
  }

  const report = async (eventId: string, reason: string) => {
    const res = await fetch(`/api/venues/${venueId}/reports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId, reason }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error || 'Could not send the report'); return }
    toast.success('Report sent. The event stays as it is until someone checks it.')
  }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-5 pb-20">
      <p className="text-xs text-muted-foreground">{city} · {role === 'ADMINISTRATOR' ? 'Venue administrator' : 'Venue manager'}</p>
      <h1 className="font-display text-2xl sm:text-3xl font-bold">{name}</h1>
      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 text-sm" aria-label="Venue sections">
        {tabs.map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 rounded-full px-3 py-1.5 ${tab === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{item}</button>
        ))}
      </nav>

      {tab === 'Overview' && (
        <section className="mt-5 space-y-3">
          <p className="text-sm text-muted-foreground">{events.length} upcoming listing{events.length === 1 ? '' : 's'} at this venue. Editing an event needs a separate organiser grant.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTab('My Venue')} className="rounded-xl border border-border p-3 text-left text-sm font-semibold">Edit Venue Profile</button>
            <button type="button" onClick={() => setTab('Upcoming Events')} className="rounded-xl border border-border p-3 text-left text-sm font-semibold">View Upcoming Events</button>
            <button type="button" onClick={() => setTab('Analytics')} className="rounded-xl border border-border p-3 text-left text-sm font-semibold">View Analytics</button>
            <button type="button" onClick={() => setTab('Promotions')} className="rounded-xl border border-border p-3 text-left text-sm font-semibold">Promote Venue</button>
          </div>
        </section>
      )}

      {tab === 'My Venue' && (
        <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); save() }}>
          <textarea className={field} rows={4} placeholder="Description" aria-label="Description" value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} />
          <textarea className={field} rows={2} placeholder="A public note, such as a renovation or a new door" aria-label="Announcement" value={profile.announcement} onChange={(e) => setProfile({ ...profile, announcement: e.target.value })} />
          <input className={field} placeholder="Public contact email" aria-label="Contact email" value={profile.contactEmail} onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })} />
          <input className={field} placeholder="Hours, like 17:00-23:00" aria-label="Opening hours" value={profile.openingHours} onChange={(e) => setProfile({ ...profile, openingHours: e.target.value })} />
          <input className={field} placeholder="Categories, comma separated" aria-label="Categories" value={profile.categories} onChange={(e) => setProfile({ ...profile, categories: e.target.value })} />
          <input className={field} placeholder="Facilities, comma separated" aria-label="Facilities" value={profile.facilities} onChange={(e) => setProfile({ ...profile, facilities: e.target.value })} />
          <textarea className={field} rows={2} placeholder="Accessibility" aria-label="Accessibility" value={profile.accessibilityInfo} onChange={(e) => setProfile({ ...profile, accessibilityInfo: e.target.value })} />
          <input className={field} placeholder="Official website (reviewed before it goes live)" aria-label="Website" value={profile.website} onChange={(e) => setProfile({ ...profile, website: e.target.value })} />
          <input className={field} placeholder="Address (reviewed before it goes live)" aria-label="Address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
          <button className="h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold">Save venue</button>
        </form>
      )}

      {tab === 'Upcoming Events' && (
        <section className="mt-5 space-y-3">
          <div className="flex gap-2 text-sm">
            <button type="button" onClick={() => setMineOnly(false)} className={`rounded-full px-3 py-1 ${!mineOnly ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>All Upcoming Events</button>
            <button type="button" onClick={() => setMineOnly(true)} className={`rounded-full px-3 py-1 ${mineOnly ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>Events I Manage</button>
          </div>
          {!shown.length && <p className="text-sm text-muted-foreground">{mineOnly ? 'None of these listings are yours to edit. Venue access doesn’t include them.' : 'Nothing upcoming is tied to this venue yet.'}</p>}
          {shown.map((event) => (
            <article key={event.id} className="rounded-xl border border-border p-3">
              <h2 className="font-semibold">{event.title}</h2>
              <p className="text-xs text-muted-foreground mt-1">{event.date.slice(0, 10)}{event.time ? ` · ${event.time}` : ''} · {event.category} · {event.status}</p>
              <p className="text-sm mt-1">Managed by: {event.organiserName || 'the organiser on the listing'}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <Link href={event.publicPath} className="underline">View Event</Link>
                <button type="button" className="underline" onClick={() => navigator.share?.({ title: event.title, url: location.origin + event.publicPath }).catch(() => navigator.clipboard.writeText(location.origin + event.publicPath))}>Share Event</button>
                <label className="underline">
                  Report Incorrect Information
                  <select className="ml-2 bg-background" aria-label={`Report ${event.title}`} defaultValue="" onChange={(e) => { if (e.target.value) report(event.id, e.target.value); e.target.value = '' }}>
                    <option value="" disabled>Choose</option>
                    {VENUE_REPORT_REASONS.map((reason) => <option key={reason.key} value={reason.key}>{reason.label}</option>)}
                  </select>
                </label>
                {event.canEdit && <Link href={`/events/${event.id}/manage`} className="underline">Edit Event</Link>}
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === 'Analytics' && (
        <section className="mt-5 space-y-3">
          <div className="flex gap-2 text-sm">
            {['7', '30', '90'].map((item) => (
              <button key={item} type="button" onClick={() => setRange(item)} className={`rounded-full px-3 py-1 ${range === item ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>Last {item} days</button>
            ))}
          </div>
          {analytics && (
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(analytics).filter(([key]) => key !== 'caveat').map(([key, value]) => (
                <li key={key} className="rounded-xl border border-border p-3"><span className="block text-xs text-muted-foreground">{key}</span><span className="font-semibold">{String(value)}</span></li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{typeof analytics?.caveat === 'string' ? analytics.caveat : 'Digital views and clicks do not prove physical attendance.'} This view never includes another organiser’s spend.</p>
        </section>
      )}

      {tab === 'Promotions' && (
        <section className="mt-5 space-y-3">
          <p className="text-sm text-muted-foreground">One-off placements. Paying does not make you the owner of events at the venue. Each placement is labelled {SPONSORED_LABEL}.</p>
          {role === 'ADMINISTRATOR' ? VENUE_PRODUCTS.map((product) => (
            <button key={product.id} type="button" className="block w-full rounded-xl border border-border p-3 text-left" onClick={async () => {
              const res = await fetch(`/api/venues/${venueId}/promote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: product.id }) })
              const data = await res.json().catch(() => ({}))
              if (!res.ok) { toast.error(data.error || 'Could not start that'); return }
              if (data.url) { location.href = data.url; return }
              toast.success(data.payments === 'soon' ? 'Card payments aren’t switched on yet. We noted your interest. This does not change who can edit events.' : `${product.name} is marked ${data.label || SPONSORED_LABEL}. Event permissions are unchanged.`)
            }}>
              <span className="font-semibold">{product.name}</span>
              <span className="block text-xs text-muted-foreground">${(product.priceCents / 100).toFixed(0)} · {product.days} days · {SPONSORED_LABEL}</span>
            </button>
          )) : <p className="text-sm text-muted-foreground">Ask a venue administrator to buy a placement.</p>}
        </section>
      )}

      {tab === 'Team & Access' && (
        <section className="mt-5 space-y-3">
          <ul className="space-y-2 text-sm">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <span>{member.name || member.email}<span className="block text-xs text-muted-foreground">{member.role} · {member.status}</span></span>
                {role === 'ADMINISTRATOR' && member.role !== 'ADMINISTRATOR' && member.status !== 'REVOKED' && (
                  <button type="button" className="text-xs underline" onClick={async () => {
                    const res = await fetch(`/api/venues/${venueId}/team`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'revoke', membershipId: member.id }) })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok) { toast.error(data.error || 'Could not remove them'); return }
                    toast.success(data.revoked ? 'Access removed just now.' : 'Updated.')
                    setMembers((list) => list.map((item) => item.id === member.id ? { ...item, status: 'REVOKED' } : item))
                  }}>Remove</button>
                )}
              </li>
            ))}
          </ul>
          {role === 'ADMINISTRATOR' && (
            <form className="flex gap-2" onSubmit={async (e) => {
              e.preventDefault()
              const email = new FormData(e.currentTarget).get('email')
              const res = await fetch(`/api/venues/${venueId}/team`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
              const data = await res.json().catch(() => ({}))
              if (!res.ok) { toast.error(data.error || 'Could not add them'); return }
              toast.success(data.memberStatus === 'ACTIVE' ? 'They’re in.' : 'Invite saved. Their email still needs to match the venue domain, or a review.')
            }}>
              <input name="email" type="email" required placeholder="Teammate’s account email" aria-label="Teammate email" className={field} />
              <button className="h-10 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold shrink-0">Add manager</button>
            </form>
          )}
          <p className="text-xs text-muted-foreground">Managers can’t transfer the venue or grant administrator access. That stays a reviewed step.</p>
        </section>
      )}

      {tab === 'Settings' && (
        <section className="mt-5 text-sm text-muted-foreground space-y-2">
          <p>Claims are free. There is no subscription in this dashboard.</p>
          <p>Removing someone takes effect immediately. Past edits stay in the venue audit log.</p>
          <Link href={`/venues/${venueId}`} className="underline">View the public profile</Link>
        </section>
      )}
    </main>
  )
}
