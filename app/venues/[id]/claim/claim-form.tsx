'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const field = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'

export function ClaimForm({ venueId, defaultName, defaultEmail, dispute }: { venueId: string; defaultName: string; defaultEmail: string; dispute: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [code, setCode] = useState('')

  const submit = async (form: FormData) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: form.get('fullName'),
          roleAtVenue: form.get('roleAtVenue'),
          businessEmail: form.get('businessEmail'),
          evidenceReference: form.get('evidenceReference'),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not send that claim')
      if (data.statusText === 'APPROVED') {
        toast.success('You’re in. The venue profile is yours to look after.')
        router.push(`/venue/${venueId}`)
        return
      }
      if (data.claimId && data.emailSent) setPendingId(data.claimId)
      toast.success(data.statusText === 'DISPUTE' ? 'Sent. It won’t change who manages the venue.' : 'Claim received. We’ll only open editing after it’s checked.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send that claim')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, claimId: pendingId }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'That code didn’t work')
      if (data.statusText === 'APPROVED') {
        toast.success('Email checked. You can manage the venue.')
        router.push(`/venue/${venueId}`)
      } else toast.success('Email checked. A person still needs to review this one.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That code didn’t work')
    } finally {
      setBusy(false)
    }
  }

  if (pendingId) {
    return (
      <div className="mt-6 space-y-3">
        <p className="text-sm">We sent a one-time code. It expires soon and works once.</p>
        <input className={field} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" aria-label="Verification code" />
        <button type="button" disabled={busy} onClick={confirm} className="h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">Confirm code</button>
      </div>
    )
  }

  return (
    <form action={submit} className="mt-6 space-y-3">
      <input required name="fullName" defaultValue={defaultName} placeholder="Your name" aria-label="Your name" className={field} />
      <input name="roleAtVenue" placeholder="Your role, such as owner or duty manager" aria-label="Role" className={field} />
      <input required type="email" name="businessEmail" defaultValue={defaultEmail} placeholder="Business email" aria-label="Business email" className={field} />
      <input name="evidenceReference" placeholder={dispute ? 'Tell us what’s wrong, or add a link' : 'Optional link that shows you work here'} aria-label="Evidence" className={field} />
      <button disabled={busy} className="h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">{dispute ? 'Send request' : 'Submit claim'}</button>
    </form>
  )
}
