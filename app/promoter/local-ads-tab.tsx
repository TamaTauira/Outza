'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, MousePointerClick, Eye, Store } from 'lucide-react'
import { LOCAL_AD, formatAud } from '@/lib/tiers'
import { kindLabel } from '@/lib/local-ads-shared'

type Ad = { id: string; kind: string; businessName: string; blurb: string; status: string; amountCents: number; paymentMode: string; endsAt: string | null; views: number; clicks: number; createdAt: string; event: { id: string; title: string; date: string; venueName: string } }
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' }) : '')

export function LocalAdsTab() {
  const [ads, setAds] = useState<Ad[] | null>(null)
  useEffect(() => {
    fetch('/api/local-ads/mine')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setAds(d.ads ?? []))
      .catch((e) => { console.error('Failed to load local ads:', e); setAds([]) })
  }, [])

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-card border border-border p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0"><Store className="w-5 h-5" /></span>
          <div>
            <h2 className="font-display text-xl font-bold">Local business ads · {formatAud(LOCAL_AD.priceCents)} per event</h2>
            <p className="text-sm text-muted-foreground mt-1">Restaurants, bars, parking providers and experience operators can appear as a “Recommended” pick beneath any upcoming event — like a pre-show dinner near a theatre. It runs until the event ends and is labelled Sponsored.</p>
            <ol className="mt-3 text-sm space-y-1 list-decimal list-inside text-muted-foreground">
              <li>Find the event your customers are heading to on the <Link href="/" className="text-primary underline">event board</Link>.</li>
              <li>Open it and choose <span className="font-medium text-foreground">Recommend your business here</span>.</li>
              <li>Pick Dinner, Bar, Parking, Experience or Service, add your details and pay {formatAud(LOCAL_AD.priceCents)}.</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
        <h3 className="font-semibold px-5 pt-5">Your recommendations</h3>
        {ads === null ? <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          : !ads.length ? <p className="px-5 py-6 text-sm text-muted-foreground">None yet. Open any upcoming event to add your first one.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px] mt-3">
                <thead className="text-left text-xs text-muted-foreground border-b border-border">
                  <tr><th className="px-5 py-2">Business</th><th className="px-3 py-2">Event</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right"><Eye className="w-3.5 h-3.5 inline" /> Views</th><th className="px-3 py-2 text-right"><MousePointerClick className="w-3.5 h-3.5 inline" /> Clicks</th><th className="px-5 py-2 text-right">Paid</th></tr>
                </thead>
                <tbody>
                  {ads.map((a) => {
                    const live = a.status === 'ACTIVE' && !!a.endsAt && new Date(a.endsAt) > new Date()
                    return (
                      <tr key={a.id} className="border-b border-border/60 last:border-0">
                        <td className="px-5 py-3"><p className="font-medium">{a.businessName}</p><p className="text-xs text-muted-foreground">{kindLabel(a.kind)}</p></td>
                        <td className="px-3 py-3"><Link href={`/events/${a.event.id}`} className="hover:text-primary underline-offset-2 hover:underline">{a.event.title}</Link><p className="text-xs text-muted-foreground">{fmt(a.event.date)} · {a.event.venueName}</p></td>
                        <td className="px-3 py-3">{live ? <span className="text-emerald-700 dark:text-emerald-400 font-medium">Live until {fmt(a.endsAt)}</span> : a.status === 'PENDING' ? <span className="text-amber-700 dark:text-amber-400">Awaiting payment</span> : <span className="text-muted-foreground">Ended</span>}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{a.views.toLocaleString('en-AU')}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{a.clicks.toLocaleString('en-AU')}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{formatAud(a.amountCents)}{a.paymentMode === 'test' && <span className="block text-[11px] text-muted-foreground">test mode</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  )
}
