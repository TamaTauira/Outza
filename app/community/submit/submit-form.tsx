'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { CITY_NAMES } from '@/lib/cities'
import { COMMUNITY_PRESETS, COMMUNITY_RECURRENCE, COMMUNITY_SECTIONS, presetByKey } from '@/lib/community-shared'

const field = 'mt-1 h-12 w-full rounded-lg border border-border bg-background px-3 text-base'
const label = 'block text-sm font-semibold'

type Fields = {
  communityKey: string
  title: string
  description: string
  suburb: string
  city: string
  startDate: string
  startTime: string
  endTime: string
  endDate: string
  recurrence: string
  recurUntil: string
  placeName: string
  streetAddress: string
  showPrecise: boolean
  organiserName: string
  contactEmail: string
  websiteUrl: string
  isFree: boolean
  priceNote: string
  isPublic: boolean
  imageRights: boolean
  childrenInImage: boolean
  imageKidSafe: boolean
  company: string
  preset: string
}

export function CommunitySubmitForm({ category, preset, email }: { category?: string; preset?: string; email: string }) {
  const startedAt = useRef(0)
  const [busy, setBusy] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [done, setDone] = useState<{ path: string; managePath?: string; posterPath?: string; approvalState?: string } | null>(null)
  const starter = presetByKey(preset)
  const [f, setF] = useState<Fields>({
    communityKey: starter?.communityKey || (COMMUNITY_SECTIONS.some((s) => s.key === category) ? category! : 'garage-sales'),
    title: '',
    description: starter?.description || '',
    suburb: '',
    city: 'Sydney',
    startDate: '',
    startTime: starter?.startTime || '09:00',
    endTime: starter?.endTime || '',
    endDate: '',
    recurrence: starter?.recurrence || 'NONE',
    recurUntil: '',
    placeName: '',
    streetAddress: '',
    showPrecise: false,
    organiserName: '',
    contactEmail: email,
    websiteUrl: '',
    isFree: starter ? starter.isFree : true,
    priceNote: '',
    isPublic: false,
    imageRights: false,
    childrenInImage: false,
    imageKidSafe: false,
    company: '',
    preset: starter?.key || '',
  })
  const school = f.communityKey === 'school-fundraisers'
  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!startedAt.current) startedAt.current = Date.now()
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
    setF({ ...f, [key]: value })
  }
  const applyPreset = (key: string) => {
    const next = presetByKey(key)
    if (!next) return
    setF({ ...f, preset: key, communityKey: next.communityKey, description: f.description || next.description, startTime: next.startTime, endTime: next.endTime, recurrence: next.recurrence, isFree: next.isFree })
  }
  const upload = async (file: File) => {
    const body = new FormData()
    body.set('image', file)
    const res = await fetch('/api/local/image', { method: 'POST', body })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(json.error ?? 'That photo didn’t upload'); return }
    setImageUrl(json.url)
    toast.success('Photo attached')
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/community', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...f, showPrecise: school ? false : f.showPrecise, imageUrl, startedAt: startedAt.current || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error ?? 'Could not save your listing'); return }
      setEventId(json.eventId)
      if (!json.emailSent) toast.message('Listing saved. Email is off right now, so the code couldn’t go out. A person can still approve it from the queue.')
      else toast.success('Code sent. Check your email.')
    } catch {
      toast.error('Could not save your listing')
    } finally { setBusy(false) }
  }
  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/community/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId, code }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error ?? 'That code didn’t work'); return }
      setDone(json)
    } finally { setBusy(false) }
  }
  const resend = async () => {
    const res = await fetch('/api/community/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId, resend: true }) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) toast.error(json.error ?? 'Could not send another code')
    else toast.success(json.emailSent ? 'Fresh code sent' : 'Email is off, so no code went out')
  }

  if (done) {
    return (
      <div className="mt-6 space-y-4 rounded-2xl bg-card p-5 shadow-sm">
        <h2 className="font-display text-2xl font-bold">{done.approvalState === 'APPROVED' ? 'It’s live. Go on, share it.' : 'Got it. A person will check this one.'}</h2>
        <p className="text-sm text-muted-foreground">School listings, photos of children and anything that looks like spam wait for a human. Everything else can go straight up once the email is confirmed.</p>
        <div className="flex flex-col gap-3">
          {done.path && <Link href={done.path} className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-5 font-semibold text-primary-foreground">More Info</Link>}
          {done.posterPath && <Link href={done.posterPath} className="inline-flex h-12 items-center justify-center rounded-full border border-border px-5 font-semibold">Printable poster</Link>}
          {done.managePath && <Link href={done.managePath} className="text-sm font-semibold text-primary underline">Edit, postpone or cancel</Link>}
        </div>
      </div>
    )
  }

  if (eventId) {
    return (
      <form onSubmit={verify} className="mt-6 space-y-4 rounded-2xl bg-card p-5 shadow-sm">
        <h2 className="font-display text-2xl font-bold">Pop in the code</h2>
        <p className="text-sm text-muted-foreground">We sent a 6-digit code and a link to {f.contactEmail}. The link works too, if tapping is more your speed.</p>
        <label className={label}>Code
          <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={field} required />
        </label>
        <button type="submit" disabled={busy} className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}Confirm listing
        </button>
        <button type="button" onClick={resend} className="block text-sm font-semibold text-primary underline">Send another code</button>
      </form>
    )
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-6">
      <div className="rounded-2xl bg-card p-4 shadow-sm">
        <label className={label}>Start from a template
          <select className={field} value={f.preset} onChange={(e) => applyPreset(e.target.value)}>
            <option value="">Blank listing</option>
            {COMMUNITY_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <p className="mt-2 text-xs text-muted-foreground">Templates fill the usual bits. You still add the suburb, the date and your email.</p>
      </div>

      <fieldset className="space-y-3">
        <legend className="font-display text-xl font-bold">What kind of thing?</legend>
        <div className="grid gap-2">
          {COMMUNITY_SECTIONS.map((section) => (
            <label key={section.key} className={`rounded-xl border p-3 text-sm ${f.communityKey === section.key ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <input type="radio" name="communityKey" value={section.key} checked={f.communityKey === section.key} onChange={set('communityKey')} className="mr-2" />
              <span className="font-semibold">{section.label}</span>
              <span className="mt-0.5 block text-muted-foreground">{section.blurb}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-4 rounded-2xl bg-card p-4 shadow-sm">
        <label className={label}>Title
          <input required maxLength={100} value={f.title} onChange={set('title')} className={field} placeholder="Saturday garage sale, Glebe" />
        </label>
        <label className={label}>What’s happening
          <textarea required minLength={20} maxLength={1500} value={f.description} onChange={set('description')} className={`${field} h-28 py-2`} placeholder="What people will find, what to bring, anything useful." />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Date
            <input required type="date" value={f.startDate} onChange={set('startDate')} className={field} />
          </label>
          <label className={label}>Starts
            <input required type="time" value={f.startTime} onChange={set('startTime')} className={field} />
          </label>
          <label className={label}>Finishes <span className="font-normal text-muted-foreground">(optional)</span>
            <input type="time" value={f.endTime} onChange={set('endTime')} className={field} />
          </label>
          <label className={label}>How often
            <select value={f.recurrence} onChange={set('recurrence')} className={field}>
              {COMMUNITY_RECURRENCE.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
        </div>
        {f.recurrence === 'NONE' ? (
          <label className={label}>Last day <span className="font-normal text-muted-foreground">(optional)</span>
            <input type="date" value={f.endDate} onChange={set('endDate')} className={field} />
          </label>
        ) : (
          <label className={label}>Repeat until <span className="font-normal text-muted-foreground">(optional, max 6 months)</span>
            <input type="date" value={f.recurUntil} onChange={set('recurUntil')} className={field} />
          </label>
        )}
      </div>

      <div className="space-y-4 rounded-2xl bg-card p-4 shadow-sm">
        <h2 className="font-display text-xl font-bold">Where</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Suburb
            <input required value={f.suburb} onChange={set('suburb')} className={field} placeholder="Newtown" autoComplete="address-level2" />
          </label>
          <label className={label}>City
            <select value={f.city} onChange={set('city')} className={field}>{CITY_NAMES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
        </div>
        <label className={label}>Place name <span className="font-normal text-muted-foreground">(optional)</span>
          <input value={f.placeName} onChange={set('placeName')} className={field} placeholder="Community hall, park, driveway" />
        </label>
        {school ? (
          <p className="text-sm text-muted-foreground">School listings show the suburb only. Don’t add a street address or a photo of children.</p>
        ) : (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={f.showPrecise} onChange={set('showPrecise')} className="mt-1 h-4 w-4 accent-[#FF4E6A]" />
            <span>Show the street address publicly. Leave this off and people only see the suburb.</span>
          </label>
        )}
        {!school && f.showPrecise && (
          <label className={label}>Street address
            <input value={f.streetAddress} onChange={set('streetAddress')} className={field} placeholder="12 Example Street" autoComplete="street-address" />
          </label>
        )}
      </div>

      <div className="space-y-4 rounded-2xl bg-card p-4 shadow-sm">
        <h2 className="font-display text-xl font-bold">Who’s running it</h2>
        <label className={label}>Name on the listing
          <input required value={f.organiserName} onChange={set('organiserName')} className={field} placeholder="Sam, or the Glebe P&C" />
        </label>
        <label className={label}>Email for the code <span className="font-normal text-muted-foreground">(kept private)</span>
          <input required type="email" value={f.contactEmail} onChange={set('contactEmail')} className={field} autoComplete="email" />
        </label>
        <label className={label}>Website or ticket link <span className="font-normal text-muted-foreground">(optional)</span>
          <input value={f.websiteUrl} onChange={set('websiteUrl')} className={field} placeholder="https://" inputMode="url" />
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={f.isFree} onChange={set('isFree')} className="h-4 w-4 accent-[#FF4E6A]" />
          Free to attend
        </label>
        {!f.isFree && (
          <label className={label}>Price note
            <input value={f.priceNote} onChange={set('priceNote')} className={field} placeholder="$5 entry" />
          </label>
        )}
        <label className={label}>Photo <span className="font-normal text-muted-foreground">(optional)</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" className={`${field} py-2`} onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file) }} />
        </label>
        {imageUrl && <p className="text-sm text-muted-foreground">Photo attached.</p>}
        {imageUrl && (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={f.imageRights} onChange={set('imageRights')} className="mt-1 h-4 w-4 accent-[#FF4E6A]" />
            <span>I took this photo or I have permission to publish it.</span>
          </label>
        )}
        {imageUrl && (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={f.childrenInImage} onChange={set('childrenInImage')} className="mt-1 h-4 w-4 accent-[#FF4E6A]" />
            <span>This photo shows children. It will not be published.</span>
          </label>
        )}
        {imageUrl && school && !f.childrenInImage && (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={f.imageKidSafe} onChange={set('imageKidSafe')} className="mt-1 h-4 w-4 accent-[#FF4E6A]" />
            <span>I confirm this photo does not show students or other children.</span>
          </label>
        )}
        <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={f.company} onChange={set('company')} name="company" />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={f.isPublic} onChange={set('isPublic')} className="mt-1 h-4 w-4 accent-[#FF4E6A]" />
          <span>This is open to the public, the details are accurate, and I agree to the <Link href="/disclaimer" className="underline">disclaimer</Link>.</span>
        </label>
      </div>

      <button type="submit" disabled={busy} className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground disabled:opacity-60">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? 'Sending your code…' : 'Send my code'}
      </button>
    </form>
  )
}
