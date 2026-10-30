'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CITY_NAMES } from '@/lib/cities'
import { COMMUNITY_RECURRENCE, COMMUNITY_SECTIONS } from '@/lib/community-shared'
import { eventPath } from '@/lib/seo'

const field = 'mt-1 h-12 w-full rounded-lg border border-border bg-background px-3 text-base'

export function CommunityManageForm({ token, listing }: { token: string; listing: Record<string, unknown> }) {
  const date = typeof listing.date === 'string' ? listing.date.slice(0, 10) : ''
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    communityKey: String(listing.communityKey || 'garage-sales'),
    title: String(listing.title || ''),
    description: String(listing.description || ''),
    suburb: String(listing.suburb || ''),
    city: String(listing.city || 'Sydney'),
    startDate: date,
    startTime: String(listing.time || '09:00'),
    endTime: String(listing.endTime || ''),
    recurrence: String(listing.recurrence || 'NONE'),
    organiserName: String(listing.organiserName || ''),
    websiteUrl: String(listing.organiserUrl || ''),
    placeName: String(listing.venueName || ''),
    streetAddress: String(listing.venueAddress || ''),
    showPrecise: listing.locationVisibility === 'PRECISE',
    isFree: listing.isFree !== false,
    priceNote: listing.isFree ? '' : String(listing.price || ''),
    isPublic: true,
    imageRights: true,
    childrenInImage: listing.childrenInImage === true,
    imageKidSafe: listing.imageKidSafe === true,
    imageUrl: listing.imageUrl ? String(listing.imageUrl) : null,
  })
  const school = f.communityKey === 'school-fundraisers'
  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
    setF({ ...f, [key]: value })
  }
  const send = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch('/api/community/manage', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, ...body }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error ?? 'Could not update the listing'); return }
      toast.success(json.review ? 'Saved. A person will check the change before it stays public.' : 'Saved')
    } finally { setBusy(false) }
  }
  const path = eventPath({ id: String(listing.id), title: String(listing.title || '') })
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Status: {String(listing.approvalState || 'pending').toLowerCase()} · {String(listing.status || 'scheduled').toLowerCase()}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href={path} className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-5 font-semibold text-primary-foreground">More Info</Link>
        <Link href={`/local/poster/${listing.id}`} className="inline-flex h-12 items-center justify-center rounded-full border border-border px-5 font-semibold">Printable poster</Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => send({ action: 'postpone' })} className="h-12 rounded-full border border-border text-sm font-semibold">Postpone</button>
        <button type="button" disabled={busy} onClick={() => send({ action: 'cancel' })} className="h-12 rounded-full border border-border text-sm font-semibold">Cancel</button>
        <button type="button" disabled={busy} onClick={() => send({ action: 'schedule' })} className="h-12 rounded-full border border-border text-sm font-semibold">Mark as on</button>
        <button type="button" disabled={busy} onClick={() => send({ action: 'save-template' })} className="h-12 rounded-full border border-border text-sm font-semibold">Save as template</button>
      </div>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); send(f) }}>
        <label className="block text-sm font-semibold">New date
          <input type="date" value={f.startDate} onChange={set('startDate')} className={field} />
        </label>
        <button type="button" disabled={busy} onClick={() => send({ action: 'reschedule', startDate: f.startDate })} className="h-12 rounded-full border border-border px-5 text-sm font-semibold">Reschedule to that date</button>
        <label className="block text-sm font-semibold">Category
          <select value={f.communityKey} onChange={set('communityKey')} className={field}>{COMMUNITY_SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </label>
        <label className="block text-sm font-semibold">Title
          <input value={f.title} onChange={set('title')} className={field} required />
        </label>
        <label className="block text-sm font-semibold">Description
          <textarea value={f.description} onChange={set('description')} className={`${field} h-28 py-2`} required />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Suburb<input value={f.suburb} onChange={set('suburb')} className={field} required /></label>
          <label className="text-sm font-semibold">City<select value={f.city} onChange={set('city')} className={field}>{CITY_NAMES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="text-sm font-semibold">Starts<input type="time" value={f.startTime} onChange={set('startTime')} className={field} required /></label>
          <label className="text-sm font-semibold">How often
            <select value={f.recurrence} onChange={set('recurrence')} className={field}>{COMMUNITY_RECURRENCE.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
          </label>
        </div>
        <label className="block text-sm font-semibold">Place name<input value={f.placeName} onChange={set('placeName')} className={field} /></label>
        {!school && (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={f.showPrecise} onChange={set('showPrecise')} className="mt-1 h-4 w-4" />
            Show the street address
          </label>
        )}
        {!school && f.showPrecise && <label className="block text-sm font-semibold">Street<input value={f.streetAddress} onChange={set('streetAddress')} className={field} /></label>}
        <label className="block text-sm font-semibold">Organiser name<input value={f.organiserName} onChange={set('organiserName')} className={field} required /></label>
        <label className="block text-sm font-semibold">Website<input value={f.websiteUrl} onChange={set('websiteUrl')} className={field} /></label>
        <button type="submit" disabled={busy} className="h-12 rounded-full bg-primary px-6 font-semibold text-primary-foreground">Save changes</button>
      </form>
      <p className="text-sm text-muted-foreground">Signed in with the same email? You can also <button type="button" className="font-semibold text-primary underline" onClick={async () => {
        const res = await fetch('/api/community/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId: listing.id }) })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) toast.error(json.error ?? 'Could not attach this to your account')
        else toast.success('Attached to your account. Promoter tools can edit it too.')
      }}>attach it to your account</button>.</p>
    </div>
  )
}
