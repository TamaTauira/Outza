'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { boardClockLine } from '@/lib/listing-window'
import { VENUE_PRODUCTS, VENUE_REPORT_REASONS, SPONSORED_LABEL } from '@/lib/ownership'
import { PromoterTermsCheck } from '@/components/promoter-terms-check'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { VenueCorrectionForm } from './correct-form'
import { VenueReachPanel } from './reach-panel'

const tabs = ['Overview', 'My Venue', 'Upcoming Events', 'Analytics', 'Promotions', 'Team & Access', 'Settings'] as const
type Tab = (typeof tabs)[number]
const field = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'

type EventRow = {
  id: string
  title: string
  date: string
  time: string | null
  endTime?: string | null
  category: string
  status: string
  organiserName: string | null
  canEdit: boolean
  publicPath: string
  imageUrl: string | null
  price?: string | null
  when?: 'upcoming' | 'past'
  canCorrect?: boolean
  fromVenue?: boolean
}

export function VenueDashboard({ venueId, name, city, role }: { venueId: string; name: string; city: string; role: string }) {
  const [tab, setTab] = useState<Tab>('Overview')
  const [events, setEvents] = useState<EventRow[]>([])
  const [mineOnly, setMineOnly] = useState(false)
  const [analytics, setAnalytics] = useState<Record<string, number | string | null> | null>(null)
  const [activity, setActivity] = useState<{
    views: number
    saves: number
    itineraryAdds: number
    ticketClicks: number
    bestNights: { label: string; views: number }[]
    categories: { category: string; views: number }[]
    areas: { label: string; people: number }[]
    hiddenAreas: number
    note: string
  } | null | undefined>(undefined)
  const [nearby, setNearby] = useState<{ basis: string; nights: { date: string; gap: boolean; events: { id: string; title: string; time: string | null; venueName: string; category: string }[] }[] } | null>(null)
  const [range, setRange] = useState('30')
  const [members, setMembers] = useState<Array<{ id: string; name: string | null; email: string; role: string; label?: string; status: string }>>([])
  const [spotlights, setSpotlights] = useState<Array<{ id: string; eventId: string; name: string; status: string; views: number | null; ticketClicks: number | null }>>([])
  const [agreeSpotlight, setAgreeSpotlight] = useState(false)
  const [monthlyOff, setMonthlyOff] = useState(false)
  const [profileReady, setProfileReady] = useState(false)
  const [followers, setFollowers] = useState<number | null>(null)
  const [profile, setProfile] = useState({ description: '', announcement: '', contactEmail: '', contactPhone: '', openingHours: '', hoursNote: '', categories: '', facilities: '', accessibilityInfo: '', gettingThere: '', website: '', instagram: '', facebook: '', address: '', photos: '' })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('paid')) toast.success('Payment received. The Spotlight is booked.')
    if (params.get('cancelled')) toast('Checkout cancelled. Nothing was charged.')
    fetch(`/api/venues/${venueId}/events`).then((r) => r.json()).then((d) => setEvents(d.events || [])).catch(() => {})
    fetch(`/api/venues/${venueId}/spotlight`).then((r) => r.json()).then((d) => setSpotlights(d.results || [])).catch(() => {})
    fetch('/api/venues/report').then((r) => r.json()).then((d) => setMonthlyOff(!!d.venueMonthlyOptOut)).catch(() => {})
    fetch(`/api/venues/${venueId}`).then((r) => r.json()).then((d) => {
      const venue = d.venue
      if (!venue) return
      if (typeof d.followers === 'number') setFollowers(d.followers)
      const hours = venue.openTime && venue.closeTime ? `${venue.openTime}-${venue.closeTime}` : ''
      setProfile({
        description: venue.description || '',
        announcement: venue.announcement || '',
        contactEmail: venue.contactEmail || '',
        contactPhone: venue.contactPhone || '',
        openingHours: hours,
        hoursNote: venue.hoursNote || '',
        categories: (venue.categories || []).join(', '),
        facilities: (venue.facilities || []).join(', '),
        accessibilityInfo: venue.accessibilityInfo || '',
        gettingThere: venue.gettingThere || '',
        website: venue.website || '',
        instagram: venue.instagram || '',
        facebook: venue.facebook || '',
        address: venue.address || '',
        photos: (venue.photos || []).join('\n'),
      })
      setProfileReady(true)
    }).catch(() => {})
  }, [venueId])

  useEffect(() => {
    if (tab !== 'Analytics') return
    fetch(`/api/venues/${venueId}/analytics?range=${range}`).then((r) => r.json()).then((d) => {
      setAnalytics(d.analytics || null)
      setActivity(d.activity ?? null)
    }).catch(() => setActivity(null))
    fetch(`/api/venues/${venueId}/nearby`).then((r) => r.json()).then((d) => setNearby(d.nights ? d : null)).catch(() => setNearby(null))
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
      <p className="text-xs text-muted-foreground">{city} · {role === 'ADMINISTRATOR' ? 'You manage this venue' : 'Venue manager'}</p>
      <h1 className="font-display text-2xl sm:text-3xl font-bold">{name}</h1>
      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 text-sm" aria-label="Venue sections">
        {tabs.map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 rounded-full px-3 py-1.5 ${tab === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{item}</button>
        ))}
      </nav>

      {tab === 'Overview' && (
        <section className="mt-5 space-y-3">
          <p className="text-sm text-muted-foreground">{events.filter((event) => event.when !== 'past').length} upcoming and {events.filter((event) => event.when === 'past').length} recent listings at this venue. You can correct price, time, image and cancellations. A full edit still needs an organiser grant.</p>
          {followers != null && <p className="text-sm">{followers === 1 ? '1 person follows this venue.' : `${followers} people follow this venue.`} New listings can show up in their email when they’ve asked for it.</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTab('My Venue')} className="rounded-xl border border-border p-3 text-left text-sm font-semibold">Edit Profile</button>
            <button type="button" onClick={() => setTab('Upcoming Events')} className="rounded-xl border border-border p-3 text-left text-sm font-semibold">What’s On</button>
            <button type="button" onClick={() => setTab('Analytics')} className="rounded-xl border border-border p-3 text-left text-sm font-semibold">The Numbers</button>
            <button type="button" onClick={() => setTab('Promotions')} className="rounded-xl border border-border p-3 text-left text-sm font-semibold">Promote the Venue</button>
          </div>
        </section>
      )}

      {tab === 'My Venue' && (
        <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); save() }}>
          <Textarea rows={4} placeholder="Description" aria-label="Description" value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} />
          <Textarea rows={2} placeholder="A public note, such as a renovation or a new door" aria-label="Announcement" value={profile.announcement} onChange={(e) => setProfile({ ...profile, announcement: e.target.value })} />
          <Input placeholder="Public contact email" aria-label="Contact email" value={profile.contactEmail} onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })} />
          <Input placeholder="Public phone" aria-label="Phone" value={profile.contactPhone} onChange={(e) => setProfile({ ...profile, contactPhone: e.target.value })} />
          <Input placeholder="Typical hours, like 17:00-23:00" aria-label="Opening hours" value={profile.openingHours} onChange={(e) => setProfile({ ...profile, openingHours: e.target.value })} />
          <Textarea rows={2} placeholder="Hours in your own words, like Wed–Sun, kitchen closes at 9pm" aria-label="Hours note" value={profile.hoursNote} onChange={(e) => setProfile({ ...profile, hoursNote: e.target.value })} />
          <Input placeholder="Categories, comma separated" aria-label="Categories" value={profile.categories} onChange={(e) => setProfile({ ...profile, categories: e.target.value })} />
          <Input placeholder="Facilities, comma separated" aria-label="Facilities" value={profile.facilities} onChange={(e) => setProfile({ ...profile, facilities: e.target.value })} />
          <Textarea rows={3} placeholder="Accessibility" aria-label="Accessibility" value={profile.accessibilityInfo} onChange={(e) => setProfile({ ...profile, accessibilityInfo: e.target.value })} />
          <Textarea rows={3} placeholder="Getting there" aria-label="Getting there" value={profile.gettingThere} onChange={(e) => setProfile({ ...profile, gettingThere: e.target.value })} />
          <Textarea rows={3} placeholder="Photo links, one https address per line (up to 8)" aria-label="Photos" value={profile.photos} onChange={(e) => setProfile({ ...profile, photos: e.target.value })} />
          <Input placeholder="Instagram" aria-label="Instagram" value={profile.instagram} onChange={(e) => setProfile({ ...profile, instagram: e.target.value })} />
          <Input placeholder="Facebook" aria-label="Facebook" value={profile.facebook} onChange={(e) => setProfile({ ...profile, facebook: e.target.value })} />
          <Input placeholder="Official website (reviewed before it goes live)" aria-label="Website" value={profile.website} onChange={(e) => setProfile({ ...profile, website: e.target.value })} />
          <Input placeholder="Address (reviewed before it goes live)" aria-label="Address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
          <Button type="submit" disabled={!profileReady}>Save venue</Button>
        </form>
      )}

      {tab === 'Upcoming Events' && (
        <section className="mt-5 space-y-3">
          {role === 'ADMINISTRATOR' && <PromoterTermsCheck id="venue-spotlight-terms" checked={agreeSpotlight} onChange={setAgreeSpotlight} />}
          <div className="flex gap-2 text-sm">
            <button type="button" onClick={() => setMineOnly(false)} className={`rounded-full px-3 py-1 ${!mineOnly ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>All Upcoming Events</button>
            <button type="button" onClick={() => setMineOnly(true)} className={`rounded-full px-3 py-1 ${mineOnly ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>Events I Manage</button>
          </div>
          {!shown.length && <EmptyState title={mineOnly ? 'Nothing you edit' : 'Nothing upcoming'} body={mineOnly ? 'None of these listings are yours to edit. Venue access doesn’t include them.' : 'Nothing upcoming is tied to this venue yet.'} />}
          {shown.map((event) => {
            const clock = boardClockLine({ ...event, city })
            return (
            <article key={event.id} className="rounded-xl border border-border p-3">
              <h2 className="font-semibold">{event.title}</h2>
              <p className="text-xs text-muted-foreground mt-1">{event.when === 'past' ? 'Past · ' : ''}{event.date.slice(0, 10)}{clock ? ` · ${clock}` : ''} · {event.category} · {event.status}{event.fromVenue ? ' · from the venue' : ''}</p>
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
                {role === 'ADMINISTRATOR' && (
                  <Button type="button" size="sm" variant="outline" disabled={!agreeSpotlight} onClick={async () => {
                    const res = await fetch('/api/promotions/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId: event.id, tier: 'BRONZE', days: 14, venueId, agreePromoterTerms: true }) })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok) { toast.error(data.error || 'Could not start Spotlight'); return }
                    if (data.url) { location.href = data.url; return }
                    toast.success(data.testMode ? 'Spotlight is booked in test mode. No card was charged.' : 'Spotlight is booked.')
                    const again = await fetch(`/api/venues/${venueId}/spotlight`).then((r) => r.json()).catch(() => null)
                    if (again?.results) setSpotlights(again.results)
                  }}>Spotlight</Button>
                )}
              </div>
              {spotlights.filter((row) => row.eventId === event.id).map((row) => (
                <p key={row.id} className="mt-2 text-xs text-muted-foreground">{row.name} · {row.status}{row.views == null ? '' : ` · ${row.views} page views · ${row.ticketClicks ?? 0} ticket clicks`}</p>
              ))}
              {event.canCorrect && (
                <VenueCorrectionForm
                  venueId={venueId}
                  event={event}
                  onSaved={(patch) => setEvents((list) => list.map((item) => item.id === event.id ? { ...item, ...patch, fromVenue: true } : item))}
                />
              )}
            </article>
            )
          })}
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
              {Object.entries(analytics).filter(([key, value]) => key !== 'caveat' && value != null).map(([key, value]) => (
                <li key={key} className="rounded-xl border border-border p-3"><span className="block text-xs text-muted-foreground">{({
                  profileViews: 'Profile views',
                  websiteClicks: 'Website clicks',
                  directionsClicks: 'Direction clicks',
                  shares: 'Shares',
                  upcomingEvents: 'Upcoming events',
                  eventViews: 'Event page views this period',
                  saves: 'Saves this period',
                  publicReactions: 'Reactions',
                  categoryLead: 'Busiest public category',
                } as Record<string, string>)[key] ?? key}</span><span className="font-semibold">{String(value)}</span></li>
              ))}
            </ul>
          )}
          {activity === null && <p className="text-sm text-muted-foreground">Event counts didn’t load. Nothing here is filled in.</p>}
          {activity && (
            <div className="space-y-3 text-sm">
              <ul className="grid grid-cols-2 gap-2">
                <li className="rounded-xl border border-border p-3"><span className="block text-xs text-muted-foreground">Itinerary adds</span><span className="font-semibold">{activity.itineraryAdds}</span></li>
                <li className="rounded-xl border border-border p-3"><span className="block text-xs text-muted-foreground">Ticket clicks</span><span className="font-semibold">{activity.ticketClicks}</span></li>
              </ul>
              <div>
                <h2 className="font-semibold">Best nights</h2>
                {activity.bestNights.length ? <ul className="mt-1">{activity.bestNights.map((night) => <li key={night.label}>{night.label}: {night.views} page views</li>)}</ul> : <p className="text-muted-foreground">No page views stored for this period.</p>}
              </div>
              <div>
                <h2 className="font-semibold">Categories</h2>
                {activity.categories.length ? <ul className="mt-1">{activity.categories.map((row) => <li key={row.category}>{row.category}: {row.views} page views</li>)}</ul> : <p className="text-muted-foreground">No category views stored for this period.</p>}
              </div>
              <div>
                <h2 className="font-semibold">Home areas</h2>
                {activity.areas.length ? <ul className="mt-1">{activity.areas.map((row) => <li key={row.label}>{row.label}: {row.people} people</li>)}</ul> : <p className="text-muted-foreground">No home area has 10 or more people in this period.</p>}
                {activity.hiddenAreas > 0 && <p className="text-xs text-muted-foreground">{activity.hiddenAreas} smaller group{activity.hiddenAreas === 1 ? '' : 's'} hidden.</p>}
              </div>
              <p className="text-xs text-muted-foreground">{activity.note}</p>
            </div>
          )}
          {nearby && (
            <div className="space-y-2 text-sm">
              <h2 className="font-semibold">Same nights nearby</h2>
              <p className="text-xs text-muted-foreground">{nearby.basis}</p>
              {!nearby.nights.length && <p className="text-muted-foreground">No upcoming nights are tied to this venue yet.</p>}
              {nearby.nights.map((night) => (
                <div key={night.date}>
                  <p className="font-medium">{night.date.slice(0, 10)}{night.gap ? ' · nothing else in range' : ` · ${night.events.length} other listing${night.events.length === 1 ? '' : 's'}`}</p>
                  <ul>{night.events.map((event) => <li key={event.id}>{event.time ? `${event.time} · ` : ''}{event.title} · {event.venueName}</li>)}</ul>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{typeof analytics?.caveat === 'string' ? analytics.caveat : 'Digital views and clicks do not prove physical attendance.'} This view never includes another organiser’s spend.</p>
          <VenueReachPanel venueId={venueId} />
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
                <span>{member.name || member.email}<span className="block text-xs text-muted-foreground">{member.label || member.role} · {member.status === 'ACTIVE' ? 'Can sign in' : member.status}</span></span>
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
              toast.success('They’re in. They sign in with their own account and can work on this venue.')
            }}>
              <input name="email" type="email" required placeholder="Teammate’s account email" aria-label="Teammate email" className={field} />
              <Button type="submit" className="shrink-0">Add staff</Button>
            </form>
          )}
          <p className="text-xs text-muted-foreground">Staff can update the profile and correct listings. They can’t buy a Spotlight or add other people. They need their own account before you add them.</p>
        </section>
      )}

      {tab === 'Settings' && (
        <section className="mt-5 text-sm text-muted-foreground space-y-2">
          <p>Claims are free. There is no subscription in this dashboard.</p>
          <label className="flex items-start gap-2 text-foreground">
            <input type="checkbox" checked={monthlyOff} onChange={async (e) => {
              const next = e.target.checked
              setMonthlyOff(next)
              const res = await fetch('/api/venues/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ venueMonthlyOptOut: next }) })
              if (!res.ok) { setMonthlyOff(!next); toast.error('Could not update the monthly note') }
            }} />
            <span>Turn off the monthly stats email. Your newsletter choice stays as it is.</span>
          </label>
          <p>Removing someone takes effect immediately. Past edits stay in the venue audit log.</p>
          <Link href={`/venues/${venueId}`} className="underline">View the public profile</Link>
        </section>
      )}
    </main>
  )
}
