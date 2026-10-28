'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Flag, BadgeCheck, Loader2, Clock, X } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { REPORT_REASONS } from '@/lib/trust-shared'

const field = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

/** “Report incorrect details” and “Claim this listing” on the event page. */
export function ListingTrustActions({ event }: { event: { id: string; title: string; promoter?: unknown; isMine?: boolean } }) {
  const { data: session } = useSession() || {}
  const pathname = usePathname()
  const [open, setOpen] = useState<'' | 'report' | 'claim'>('')
  const [busy, setBusy] = useState(false)
  const [claimStatus, setClaimStatus] = useState<string | null>(null)
  const [report, setReport] = useState({ reason: '', details: '', email: '' })
  const [claim, setClaim] = useState({ orgName: '', position: '', evidenceUrl: '', message: '' })
  const canClaim = !event.promoter && !event.isMine

  useEffect(() => {
    if (!session?.user || !canClaim) return
    fetch(`/api/events/${event.id}/claim`).then((r) => r.json()).then((d) => setClaimStatus(d?.claim?.status ?? null)).catch(console.error)
  }, [session?.user, event.id, canClaim])

  useEffect(() => { if (window.location.hash === '#report') setOpen('report') }, [])

  const toggle = (which: 'report' | 'claim') => {
    const next = open === which ? '' : which
    setOpen(next)
    window.history.replaceState(null, '', next ? `#${next}` : window.location.pathname + window.location.search)
    if (next) setTimeout(() => document.getElementById(`listing-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }

  const post = async (path: string, body: object) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/events/${event.id}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Something went wrong'); return null }
      return d
    } catch (err) {
      console.error(err); toast.error('Something went wrong'); return null
    } finally { setBusy(false) }
  }

  const sendReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!report.reason) { toast.error('Please choose what is wrong'); return }
    const d = await post('report', report)
    if (d) { toast.success('Thanks. We’ll check this listing against the source.'); setOpen(''); setReport({ reason: '', details: '', email: '' }) }
  }
  const sendClaim = async (e: React.FormEvent) => {
    e.preventDefault()
    const d = await post('claim', claim)
    if (d) {
      setClaimStatus(d.status)
      toast.success(d.status === 'APPROVED' ? 'Verified. This listing is now in your promoter dashboard.' : 'Claim sent. We’ll verify you and email you.')
      setOpen('')
    }
  }

  return (
    <div className="mt-6 text-sm">
     <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <a href="#report" aria-expanded={open === 'report'} onClick={(e) => { e.preventDefault(); toggle('report') }} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
        <Flag className="w-4 h-4" />{open === 'report' ? 'Close report form' : 'Something not right? Tell us'}
      </a>
      {canClaim && (claimStatus === 'PENDING' ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Clock className="w-4 h-4" />Your claim is pending verification</span>
      ) : claimStatus === 'APPROVED' ? (
        <Link href="/promoter" className="inline-flex items-center gap-1.5 text-primary hover:underline"><BadgeCheck className="w-4 h-4" />You manage this listing</Link>
      ) : session?.user ? (
        <a href="#claim" aria-expanded={open === 'claim'} onClick={(e) => { e.preventDefault(); toggle('claim') }} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><BadgeCheck className="w-4 h-4" />Is this your gig? Make it official</a>
      ) : (
        <Link href={`/login?as=promoter&next=${encodeURIComponent(pathname || '/')}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
          <BadgeCheck className="w-4 h-4" />Is this your gig? Sign in to make it official
        </Link>
      ))}
     </div>

      {open === 'report' && (
        <section id="listing-report" aria-label="Report incorrect details" className="mt-4 rounded-xl bg-card p-5 shadow-md ring-1 ring-border">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
            <h3 className="font-semibold text-base">Report incorrect details</h3>
            <p className="text-muted-foreground mt-1">Tell us what’s wrong with “{event.title}”. We check reports against the original source before changing anything.</p>
            </div>
            <button type="button" aria-label="Close" onClick={() => setOpen('')} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <form onSubmit={sendReport} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="What is wrong">
              {REPORT_REASONS.map((r) => (
                <label key={r.key} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${report.reason === r.key ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
                  <input type="radio" name="reason" value={r.key} checked={report.reason === r.key} onChange={() => setReport({ ...report, reason: r.key })} className="accent-primary" />{r.label}
                </label>
              ))}
            </div>
            <textarea className={field} rows={3} maxLength={2000} placeholder="What should it say? A link to the correct information helps." value={report.details} onChange={(e) => setReport({ ...report, details: e.target.value })} />
            {!session?.user && <input type="email" className={field} placeholder="Your email (optional, only if you’d like a reply)" value={report.email} onChange={(e) => setReport({ ...report, email: e.target.value })} />}
            <button type="submit" disabled={busy} className="w-full h-10 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}Send report
            </button>
          </form>
        </section>
      )}

      {open === 'claim' && (
        <section id="listing-claim" aria-label="Claim this listing" className="mt-4 rounded-xl bg-card p-5 shadow-md ring-1 ring-border">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
            <h3 className="font-semibold text-base">Claim this listing</h3>
            <p className="text-muted-foreground mt-1">
              Verified organisers can correct details and promote the event. If your account email uses the same domain as the event’s website, you’re verified straight away; otherwise we review your claim by hand.
            </p>
            </div>
            <button type="button" aria-label="Close" onClick={() => setOpen('')} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <form onSubmit={sendClaim} className="space-y-3">
            <input required className={field} maxLength={120} placeholder="Organisation or business name" value={claim.orgName} onChange={(e) => setClaim({ ...claim, orgName: e.target.value })} />
            <input className={field} maxLength={120} placeholder="Your role (e.g. promoter, venue manager)" value={claim.position} onChange={(e) => setClaim({ ...claim, position: e.target.value })} />
            <input className={field} maxLength={500} placeholder="Link that shows you run this event (official site, socials)" value={claim.evidenceUrl} onChange={(e) => setClaim({ ...claim, evidenceUrl: e.target.value })} />
            <textarea className={field} rows={3} maxLength={2000} placeholder="Anything else that helps us verify you" value={claim.message} onChange={(e) => setClaim({ ...claim, message: e.target.value })} />
            <p className="text-xs text-muted-foreground">Claiming is free. Signed in as {session?.user?.email}.</p>
            <button type="submit" disabled={busy} className="w-full h-10 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}Submit claim
            </button>
          </form>
        </section>
      )}
    </div>
  )
}
