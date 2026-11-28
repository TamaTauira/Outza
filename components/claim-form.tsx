'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

const field = 'h-control w-full rounded-control border border-border bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/40'

/**
 * The one listing-claim form, shared by the event-page claim panel and the promoter
 * dashboard's “Already listed? Claim it” search, so both surfaces ask for the same
 * evidence — organisation, role, evidence link, notes — and word it the same way.
 * It posts the fields to `submitUrl`: the event-page claim endpoint by default, or
 * the dashboard claim endpoint with the eventId carried in `bodyExtra`.
 */
export function ClaimListingForm({ eventId, email, submitUrl, bodyExtra, onClose, onSuccess }: {
  eventId: string
  email?: string | null
  submitUrl?: string
  bodyExtra?: Record<string, unknown>
  onClose?: () => void
  onSuccess?: (d: { status?: string }) => void
}) {
  const [busy, setBusy] = useState(false)
  const [claim, setClaim] = useState({ orgName: '', position: '', evidenceUrl: '', message: '' })

  const sendClaim = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch(submitUrl ?? `/api/events/${eventId}/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...claim, ...bodyExtra }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Oops, that one didn’t land. Give it another go.'); return }
      toast.success(d.status === 'APPROVED' ? 'This listing is now in your promoter dashboard.' : 'Claim sent. We’ll review it and email you.')
      onSuccess?.(d)
    } catch (err) {
      console.error(err); toast.error('Oops, that one didn’t land. Give it another go.')
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-base">Claim this listing</h3>
          <p className="text-muted-foreground mt-1">
            Are you the organiser? Verify your connection so you can update the details and see how it’s travelling. If your account email uses the same domain as the event’s website, the claim is accepted straight away. Otherwise a person reviews it. Knowing the public details is not enough.
          </p>
        </div>
        {onClose && <button type="button" aria-label="Close" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
      </div>
      <form onSubmit={sendClaim} className="space-y-3">
        <input required className={field} maxLength={120} placeholder="Organisation or business name" value={claim.orgName} onChange={(e) => setClaim({ ...claim, orgName: e.target.value })} />
        <input className={field} maxLength={120} placeholder="Your role (e.g. promoter, venue manager)" value={claim.position} onChange={(e) => setClaim({ ...claim, position: e.target.value })} />
        <input className={field} maxLength={500} placeholder="Link that shows you run this event (official site, socials)" value={claim.evidenceUrl} onChange={(e) => setClaim({ ...claim, evidenceUrl: e.target.value })} />
        <textarea className={field} rows={3} maxLength={2000} placeholder="Anything else that helps us check this claim" value={claim.message} onChange={(e) => setClaim({ ...claim, message: e.target.value })} />
        <p className="text-xs text-muted-foreground">Claiming is free. Signed in as {email}.</p>
        <button type="submit" disabled={busy} className="w-full h-10 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}Submit Claim
        </button>
      </form>
    </>
  )
}
