'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { CITIES } from '@/lib/cities'

type PlanRow = { token: string; name: string; city: string | null; planDate: string | null; items: number; votes: number }

export function TogetherHome() {
  const router = useRouter()
  const [plans, setPlans] = useState<PlanRow[] | null>(null)
  const [name, setName] = useState('')
  const [city, setCity] = useState('Sydney')
  const [planDate, setPlanDate] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    fetch('/api/together').then((r) => r.json()).then((d) => setPlans(d?.plans ?? [])).catch(() => setPlans([]))
  }
  useEffect(() => { load() }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/together', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, city, planDate: planDate || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not create the plan')
      router.push(`/together/${data.token}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the plan')
      setBusy(false)
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">VibePeep Together</p>
      <h1 className="font-display text-3xl sm:text-4xl font-bold mt-2">Plan it with your people.</h1>
      <p className="mt-3 text-muted-foreground text-base sm:text-lg">Shortlist a few events, send one link, and vote. Guests can join without making an account.</p>

      <form onSubmit={create} className="mt-6 rounded-xl bg-card border border-border p-4 sm:p-5 space-y-3">
        <label className="block text-sm font-semibold" htmlFor="plan-name">Plan name</label>
        <input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Saturday in Newtown" className="w-full h-11 rounded-md border border-border bg-background px-3 text-sm" />
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-semibold">City <span className="font-normal text-muted-foreground">(optional)</span></span>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full h-11 rounded-md border border-border bg-background px-3 text-sm">
              {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Date <span className="font-normal text-muted-foreground">(optional)</span></span>
            <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} className="mt-1 w-full h-11 rounded-md border border-border bg-background px-3 text-sm" />
          </label>
        </div>
        <button disabled={busy} className="h-11 px-5 rounded-md bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}Start a Plan
        </button>
      </form>

      <section className="mt-8">
        <h2 className="font-display text-xl font-bold mb-3">Your plans</h2>
        {plans === null && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
        {plans?.length === 0 && <p className="text-sm text-muted-foreground">None yet. Start one, or open an invite link a friend sent you.</p>}
        <ul className="space-y-2">
          {plans?.map((plan) => (
            <li key={plan.token}>
              <Link href={`/together/${plan.token}`} className="block rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted">
                <span className="font-semibold">{plan.name}</span>
                <span className="block text-sm text-muted-foreground mt-0.5">
                  {[plan.city, plan.planDate, `${plan.items} options`, `${plan.votes} votes`].filter(Boolean).join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
