'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, X } from 'lucide-react'
import { CATEGORIES } from '@/lib/categories'
import { CITIES } from '@/lib/cities'

export type EditableEvent = {
  id: string; title: string; date: string; endDate?: string | null; venueName: string; city?: string
  category?: string; subTags?: string[]; isLGBTI?: boolean
  time?: string | null; endTime?: string | null; venueAddress?: string | null; price?: string | null; isFree?: boolean; ticketUrl?: string | null; imageUrl?: string | null; description?: string | null
  organiserName?: string | null; organiserUrl?: string | null; accessibilityInfo?: string | null; ageRestriction?: string | null; transportInfo?: string | null
}

const field = 'h-10 rounded-md border border-border bg-background px-3 text-sm w-full'
const area = 'rounded-md border border-border bg-background px-3 py-2 text-sm w-full'

/** Inline editor for a listing the promoter owns. Saved edits are protected from automatic source refreshes. */
export function EditEventPanel({ event, onClose, onSaved }: { event: EditableEvent; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    title: event.title, date: event.date.slice(0, 10), endDate: event.endDate?.slice(0, 10) ?? '', time: event.time ?? '', endTime: event.endTime ?? '',
    venueName: event.venueName, venueAddress: event.venueAddress ?? '', city: event.city || 'Sydney', category: event.category || 'Community', subTag: event.subTags?.[0] ?? '',
    price: event.isFree ? '' : event.price ?? '', isFree: !!event.isFree, isLGBTI: !!event.isLGBTI, ticketUrl: event.ticketUrl ?? '', imageUrl: event.imageUrl ?? '', description: event.description ?? '',
    organiserName: event.organiserName ?? '', organiserUrl: event.organiserUrl ?? '', accessibilityInfo: event.accessibilityInfo ?? '', ageRestriction: event.ageRestriction ?? '', transportInfo: event.transportInfo ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((cur) => ({ ...cur, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value, ...(k === 'category' ? { subTag: '' } : {}) }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true)
    try {
      const res = await fetch(`/api/promoter/events/${event.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, subTags: f.subTag ? [f.subTag] : [] }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Could not save changes')
      toast.success('Listing updated'); onSaved()
    } catch (err) { console.error('Edit failed:', err); toast.error(err instanceof Error ? err.message : 'Could not save changes') } finally { setBusy(false) }
  }
  const subTags = CATEGORIES.find((c) => c.name === f.category)?.subTags ?? []

  return (
    <form onSubmit={save} className="rounded-lg border border-primary/40 bg-background p-4 grid sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2 flex items-start justify-between gap-3">
        <div><p className="font-semibold text-sm">Edit listing</p><p className="text-xs text-muted-foreground">Your changes go live straight away, and automatic source updates won&apos;t overwrite them.</p></div>
        <button type="button" onClick={onClose} aria-label="Close editor" className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
      </div>
      <input required value={f.title} onChange={set('title')} placeholder="Event title" aria-label="Event title" className={`${field} sm:col-span-2`} />
      <input required type="date" value={f.date} onChange={set('date')} className={field} aria-label="Start date" />
      <input type="date" value={f.endDate} onChange={set('endDate')} className={field} aria-label="End date" />
      <div className="grid grid-cols-2 gap-2">
        <input type="time" value={f.time} onChange={set('time')} className={field} aria-label="Start time" title="Start time" />
        <input type="time" value={f.endTime} onChange={set('endTime')} className={field} aria-label="Finish time" title="Finish time" />
      </div>
      <input required value={f.venueName} onChange={set('venueName')} placeholder="Venue" aria-label="Venue" className={field} />
      <input value={f.venueAddress} onChange={set('venueAddress')} placeholder="Street, suburb, postcode" aria-label="Address" className={field} />
      <select value={f.city} onChange={set('city')} className={field} aria-label="City">{CITIES.map((c) => <option key={c.name}>{c.name}</option>)}</select>
      <select value={f.category} onChange={set('category')} className={field} aria-label="Category">{CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}</select>
      <select value={f.subTag} onChange={set('subTag')} className={field} aria-label="Subtag"><option value="">Subtag (optional)</option>{subTags.map((t) => <option key={t}>{t}</option>)}</select>
      <input value={f.price} onChange={set('price')} placeholder="Price e.g. $25 or Free" aria-label="Price" disabled={f.isFree} className={field} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isFree} onChange={set('isFree')} /> Free event</label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.isLGBTI} onChange={set('isLGBTI')} /> LGBTIQ+ event</label>
      <input value={f.ticketUrl} onChange={set('ticketUrl')} placeholder="Ticket link (https://...)" aria-label="Ticket link" className={`${field} sm:col-span-2`} />
      <input value={f.imageUrl} onChange={set('imageUrl')} placeholder="Paste an image link" aria-label="Image link" className={`${field} sm:col-span-2`} />
      <textarea value={f.description} onChange={set('description')} placeholder="Description" aria-label="Description" rows={3} className={`${area} sm:col-span-2`} />
      <input value={f.organiserName} onChange={set('organiserName')} placeholder="Organiser name" aria-label="Organiser name" className={field} />
      <input value={f.organiserUrl} onChange={set('organiserUrl')} placeholder="Organiser website (https://...)" aria-label="Organiser website" className={field} />
      <input value={f.ageRestriction} onChange={set('ageRestriction')} placeholder="Age restriction e.g. 18+" aria-label="Age restriction" className={field} />
      <span className="hidden sm:block" />
      <textarea value={f.accessibilityInfo} onChange={set('accessibilityInfo')} placeholder="Accessibility" aria-label="Accessibility" rows={2} className={`${area} sm:col-span-2`} />
      <textarea value={f.transportInfo} onChange={set('transportInfo')} placeholder="Getting there" aria-label="Getting there" rows={2} className={`${area} sm:col-span-2`} />
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-10 px-4 rounded-md border border-border text-sm hover:bg-muted">Cancel</button>
        <button disabled={busy} className="h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2 disabled:opacity-60">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save changes</button>
      </div>
    </form>
  )
}
