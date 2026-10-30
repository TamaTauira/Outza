'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { ORGANISER_PLANS, type PlanId } from '@/lib/sponsorship'
import { formatAud } from '@/lib/tiers'

type Plan = (typeof ORGANISER_PLANS)[number] & { priceConfigured?: boolean }
type Current = {
  id: string
  name: string
  status: string
  amountCents: number
  cancelAtPeriodEnd: boolean
  pendingPlanId: string | null
  pendingPlanAt: string | null
  currentPeriodEnd: string | null
}
type Charge = { id: string; amountCents: number; status: string; createdAt: string; hostedUrl?: string | null }

const field = 'h-11 w-full rounded-md border border-border bg-background px-3 text-base sm:text-sm'

export function OrganiserPlans() {
  const [plans, setPlans] = useState<Plan[]>([...ORGANISER_PLANS])
  const [current, setCurrent] = useState<Current | null>(null)
  const [charges, setCharges] = useState<Charge[]>([])
  const [subsOn, setSubsOn] = useState<boolean | null>(null)
  const [refund, setRefund] = useState({ eligible: false, reason: '' })
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [quotePlan, setQuotePlan] = useState<PlanId>('LOCAL_PRO')

  const load = async () => {
    const data = await fetch('/api/promoter/subscription').then((r) => r.json()).catch(() => null)
    if (!data) return
    if (data.plans) setPlans(data.plans)
    setCurrent(data.plan ?? null)
    setCharges(data.charges ?? [])
    if (typeof data.subscriptionsEnabled === 'boolean') setSubsOn(data.subscriptionsEnabled)
    if (data.refund) setRefund(data.refund)
  }

  useEffect(() => {
    load().catch((error) => console.error('Plan failed to load', error))
    const params = new URLSearchParams(window.location.search)
    if (params.get('plan') === '1') {
      const sessionId = params.get('session_id')
      if (sessionId) {
        fetch('/api/sponsorships/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) })
          .then(() => load())
          .catch((error) => console.error('Plan confirm failed', error))
      }
      toast.success('Payment received. The plan switches on once Stripe confirms the invoice.')
    }
  }, [])

  const choose = async (planId: PlanId) => {
    if (subsOn === false) { setQuotePlan(planId); toast('Payments coming soon. Use the quote box. Nothing is charged.'); return }
    if (!consent) { toast.error('Tick the box first. Monthly plans charge today, then each month, until you cancel.'); return }
    setBusy(planId)
    try {
      const res = await fetch('/api/promoter/subscription', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: current ? 'change' : 'checkout', planId, consent: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.payments === 'soon') { setSubsOn(false); toast('Payments coming soon. Nothing was charged.'); return }
      if (!res.ok) throw new Error(data?.error ?? 'Could not change the plan')
      if (data.url) { window.location.href = data.url; return }
      toast.success(data.when === 'period-end' ? 'That switch waits until the renewal date.' : data.pendingPayment ? 'Stripe needs you to finish the extra charge.' : 'Plan updated.')
      if (data.url && data.pendingPayment) window.location.href = data.url
      setConsent(false)
      load().catch(() => {})
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change the plan')
    } finally { setBusy(null) }
  }

  const cancel = async () => {
    if (!window.confirm('Stop the renewal? You keep the plan until the date already paid.')) return
    setBusy('cancel')
    const res = await fetch('/api/promoter/subscription', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { toast.error(data?.error ?? 'Could not cancel'); return }
    toast.success('Renewal cancelled. The current period stays put.')
    load().catch(() => {})
  }

  const refundNow = async () => {
    if (!window.confirm('Refund the latest plan charge and end the plan now?')) return
    setBusy('refund')
    const res = await fetch('/api/promoter/subscription', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refund', consent: true }) })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { toast.error(data?.error ?? 'Could not refund'); return }
    toast.success('Refund sent.')
    load().catch(() => {})
  }

  const quote = async () => {
    setBusy('quote')
    const res = await fetch('/api/sponsorships/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'PLAN', email, note, planId: quotePlan }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { toast.error(data?.error ?? 'Could not send that'); return }
    toast.success('Quote requested. Nothing was charged.')
  }

  const until = current?.currentPeriodEnd ? new Date(current.currentPeriodEnd).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : null

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-display text-xl font-bold">Monthly organiser plans</h2>
      <p className="mt-1 text-sm text-muted-foreground">These are working tools, not just a louder listing. Promoter Pro is still the 30-day pass. A monthly plan does not start a trial and does not charge until you tick the box.</p>
      {current && (
        <p className="mt-3 text-sm">You are on <strong>{current.name}</strong>{until ? ` until ${until}` : ''}{current.cancelAtPeriodEnd ? ' · renewal cancelled' : ''}{current.pendingPlanId ? ` · switches to ${current.pendingPlanId.replace('_', ' ')} next period` : ''}.</p>
      )}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.id} className={`rounded-xl border p-4 ${current?.id === plan.id ? 'border-primary' : 'border-border'}`}>
            <p className="font-semibold">{plan.name}</p>
            <p className="mt-1 text-2xl font-bold">{formatAud(plan.monthlyCents)}<span className="text-xs font-normal text-muted-foreground"> / month</span></p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            <button type="button" disabled={busy === plan.id || current?.id === plan.id} onClick={() => choose(plan.id)} className="mt-3 flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {busy === plan.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {current?.id === plan.id ? 'Current plan' : current ? 'Switch to this' : 'Choose this plan'}
            </button>
          </div>
        ))}
      </div>
      {subsOn === false ? (
        <div className="mt-4 space-y-2 rounded-lg border border-primary/40 p-4">
          <p className="text-sm font-medium">Payments coming soon</p>
          <p className="text-xs text-muted-foreground">Request a quote. We will not charge a card from this form, and we will not start a plan.</p>
          <select value={quotePlan} onChange={(e) => setQuotePlan(e.target.value as PlanId)} className={field} aria-label="Plan to quote">
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@venue.com" className={field} aria-label="Email for the plan quote" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What you want the plan to do" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <button type="button" onClick={quote} disabled={busy === 'quote'} className="h-11 rounded-md border border-border px-4 text-sm font-semibold">Request a quote</button>
        </div>
      ) : (
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
          <span>I agree to be charged the plan price in AUD today, and the same amount each month until I cancel. There is no free trial.</span>
        </label>
      )}
      {current && (
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {!current.cancelAtPeriodEnd && <button type="button" onClick={cancel} disabled={busy === 'cancel'} className="underline text-muted-foreground">Cancel renewal</button>}
          {refund.eligible && <button type="button" onClick={refundNow} disabled={busy === 'refund'} className="underline text-muted-foreground">Refund this period</button>}
        </div>
      )}
      {refund.reason && <p className="mt-2 text-[11px] text-muted-foreground">{refund.reason}</p>}
      {!!charges.length && (
        <ul className="mt-4 divide-y divide-border text-sm">
          {charges.map((charge) => (
            <li key={charge.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{new Date(charge.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} · {charge.status}</span>
              <span className="font-semibold tabular-nums">{formatAud(charge.amountCents)}</span>
              <Link href={`/promoter/invoice/${encodeURIComponent(charge.id)}`} className="text-xs font-semibold text-primary">Invoice</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
