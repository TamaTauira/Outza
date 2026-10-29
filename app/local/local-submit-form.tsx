'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Repeat, Loader2 } from 'lucide-react'
import { CITY_NAMES } from '@/lib/cities'
import { LOCAL_CATEGORIES, RECURRENCES, MAX_SPAN_DAYS, recurrenceLabel, occurrences, addDaysStr, fmtDay } from '@/lib/local-shared'
import { LocalImportCard, type ImportResult } from './local-import-card'
import { LocalImageField, type LocalImage } from './local-image-field'

const baseField = 'w-full h-11 rounded-lg border border-border bg-background px-3 text-sm'
const REQUIRED = ['title', 'description', 'address', 'suburb', 'postcode', 'startDate', 'startTime', 'endTime', 'organiserName'] as const
const label = 'block text-sm font-semibold mb-1.5'

export function LocalSubmitForm({ defaultCity, signedIn, defaultEmail, onDone }: { defaultCity: string; signedIn: boolean; defaultEmail: string; onDone: () => void }) {
  const startedAt = useRef<number>(0)
  const [busy, setBusy] = useState(false)
  const [imported, setImported] = useState<ImportResult | null>(null)
  const [image, setImage] = useState<LocalImage>(null)
  const [imageRights, setImageRights] = useState(false)
  const [f, setF] = useState({
    title: '', category: 'GARAGE', description: '', address: '', suburb: '', postcode: '', city: defaultCity,
    startDate: '', endDate: '', startTime: '08:00', endTime: '13:00', recurrence: 'NONE', recurUntil: '',
    priceNote: '', organiserName: '', contactEmail: defaultEmail, websiteUrl: '', isPublic: false, company: '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!startedAt.current) startedAt.current = Date.now()
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value })
  }
  // After an import, required fields still empty get an orange ring until the lister fills them.
  const needs = (k: keyof typeof f) => !!imported && (REQUIRED as readonly string[]).includes(k) && !String(f[k]).trim()
  const field = (k: keyof typeof f) => needs(k) ? `${baseField} ring-2 ring-[#FF4E6A] border-[#FF4E6A]` : baseField
  const applyImport = (r: ImportResult) => {
    if (!startedAt.current) startedAt.current = Date.now()
    const next = { ...f }
    for (const [k, v] of Object.entries(r.fields)) if (v && k in next && k !== 'contactEmail') (next as Record<string, unknown>)[k] = v
    // Don't leave the default times in place when the source didn't state them.
    if (!r.fields.startTime) next.startTime = ''
    if (!r.fields.endTime) next.endTime = ''
    if (r.fields.endDate && next.recurrence === 'NONE') next.endDate = r.fields.endDate
    setF(next)
    setImported(r)
  }
  const preview = f.startDate && f.recurrence !== 'NONE'
    ? occurrences({ startDate: f.startDate, recurrence: f.recurrence, recurUntil: f.recurUntil || null }, f.startDate, addDaysStr(f.startDate, 120)).slice(0, 4)
    : []

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (image && !imageRights) { toast.error('Please confirm you own the photo or have permission to use it, or remove it.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/local', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, endDate: f.endDate || null, recurUntil: f.recurUntil || null, startedAt: startedAt.current || null, imagePath: image?.path ?? null, imageRights }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? 'Could not save your listing'); return }
      if (j.status === 'APPROVED') toast.success('Your listing is live on VibePeep Local')
      else toast.message('Thanks! A person will check your listing shortly', { description: j.notes?.length ? `Why: ${j.notes.join(', ')}.` : undefined })
      onDone()
    } catch (err) {
      console.error(err)
      toast.error('Could not save your listing')
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="mt-8 max-w-3xl space-y-6">
      <div className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
        Free for everyone. {signedIn ? 'Listings from signed-in accounts that pass our automatic checks go live straight away.' : <>Listings without an account are checked by a person first. <Link href="/login?next=/local?tab=submit" className="text-primary underline">Sign in</Link> to go live faster and manage your listings.</>}
      </div>

      <LocalImportCard city={f.city} onImported={applyImport} result={imported} />

      <div className="rounded-2xl bg-card shadow-sm p-6 space-y-4">
        <h2 className="font-display text-xl font-bold">What is it?</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {LOCAL_CATEGORIES.map((c) => (
            <label key={c.key} className={`rounded-xl border p-3 cursor-pointer text-sm ${f.category === c.key ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <input type="radio" name="category" value={c.key} checked={f.category === c.key} onChange={set('category')} className="sr-only" />
              <span className="font-semibold">{c.label}</span>
            </label>
          ))}
        </div>
        <div><label className={label} htmlFor="l-title">Title</label><input id="l-title" className={field('title')} value={f.title} onChange={set('title')} maxLength={100} placeholder="e.g. Big family moving sale — furniture & kids’ toys" required /></div>
        <div><label className={label} htmlFor="l-desc">Description</label><textarea id="l-desc" className={`${field('description')} h-28 py-2`} value={f.description} onChange={set('description')} maxLength={1500} placeholder="What’s on offer, parking, cash or card, accessibility…" required /></div>
        <div><label className={label} htmlFor="l-price">Price or entry (optional)</label><input id="l-price" className={field('priceNote')} value={f.priceNote} onChange={set('priceNote')} maxLength={80} placeholder="e.g. Free entry · cash only" /></div>
      </div>

      <LocalImageField image={image} onChange={setImage} rights={imageRights} onRights={setImageRights} />

      <div className="rounded-2xl bg-card shadow-sm p-6 space-y-4">
        <h2 className="font-display text-xl font-bold">Where?</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><label className={label} htmlFor="l-addr">Street address</label><input id="l-addr" className={field('address')} value={f.address} onChange={set('address')} placeholder="12 Example Street" autoComplete="street-address" required /></div>
          <div><label className={label} htmlFor="l-sub">Suburb</label><input id="l-sub" className={field('suburb')} value={f.suburb} onChange={set('suburb')} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label} htmlFor="l-pc">Postcode</label><input id="l-pc" className={field('postcode')} value={f.postcode} onChange={set('postcode')} inputMode="numeric" maxLength={4} required /></div>
            <div><label className={label} htmlFor="l-city">City</label><select id="l-city" className={field('city')} value={f.city} onChange={set('city')}>{CITY_NAMES.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">We check the address against OpenStreetMap. The address is shown publicly so people can find you.</p>
      </div>

      <div className="rounded-2xl bg-card shadow-sm p-6 space-y-4">
        <h2 className="font-display text-xl font-bold">When?</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div><label className={label} htmlFor="l-date">{f.recurrence === 'NONE' ? 'Date' : 'First date'}</label><input id="l-date" type="date" className={field('startDate')} value={f.startDate} onChange={set('startDate')} required /></div>
          <div><label className={label} htmlFor="l-st">Starts</label><input id="l-st" type="time" className={field('startTime')} value={f.startTime} onChange={set('startTime')} required /></div>
          <div><label className={label} htmlFor="l-et">Finishes</label><input id="l-et" type="time" className={field('endTime')} value={f.endTime} onChange={set('endTime')} required /></div>
        </div>
        <div><label className={label} htmlFor="l-rec">How often?</label>
          <select id="l-rec" className={field('recurrence')} value={f.recurrence} onChange={set('recurrence')}>{RECURRENCES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
        </div>
        {f.recurrence === 'NONE' ? (
          <div className="sm:w-1/2"><label className={label} htmlFor="l-end">Last day (optional, for multi-day sales or events up to {MAX_SPAN_DAYS} days)</label><input id="l-end" type="date" className={field('endDate')} value={f.endDate} min={f.startDate || undefined} onChange={set('endDate')} /></div>
        ) : (
          <div className="space-y-3">
            <div className="sm:w-1/2"><label className={label} htmlFor="l-until">Repeat until (optional, max 6 months)</label><input id="l-until" type="date" className={field('recurUntil')} value={f.recurUntil} min={f.startDate || undefined} onChange={set('recurUntil')} /></div>
            {preview.length > 0 && (
              <p className="rounded-xl bg-primary/5 p-3 text-sm flex gap-2"><Repeat className="w-4 h-4 text-primary shrink-0 mt-0.5" /><span><b>{recurrenceLabel({ startDate: f.startDate, recurrence: f.recurrence, category: f.category })}</b> — next dates: {preview.map(fmtDay).join(' · ')}</span></p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-card shadow-sm p-6 space-y-4">
        <h2 className="font-display text-xl font-bold">Who’s running it?</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className={label} htmlFor="l-org">Name shown on the listing</label><input id="l-org" className={field('organiserName')} value={f.organiserName} onChange={set('organiserName')} placeholder="e.g. Sam, or Glebe Makers Collective" required /></div>
          <div><label className={label} htmlFor="l-email">Contact email (private)</label><input id="l-email" type="email" className={field('contactEmail')} value={f.contactEmail} onChange={set('contactEmail')} required /></div>
          <div className="sm:col-span-2"><label className={label} htmlFor="l-web">Website or public event page (optional)</label><input id="l-web" className={field('websiteUrl')} value={f.websiteUrl} onChange={set('websiteUrl')} placeholder="https://" /></div>
        </div>
        <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={f.company} onChange={set('company')} name="company" />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={f.isPublic} onChange={set('isPublic')} className="mt-1 h-4 w-4 accent-[#FF4E6A]" />
          <span>This is open to the public (not a private or invitation-only event), the details are accurate, and I agree to the <Link href="/disclaimer" className="underline" target="_blank">disclaimer</Link>.</span>
        </label>
      </div>

      <button type="submit" disabled={busy} className="h-12 px-8 rounded-full bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2 disabled:opacity-60">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}{busy ? 'Checking your listing…' : 'Publish free listing'}
      </button>
    </form>
  )
}
