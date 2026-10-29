'use client'

import { useEffect, useState } from 'react'
import { CITY_NAMES } from '@/lib/cities'

type Built = {
  html: string; text: string; subject: string; preview: string; chosen: string; cta: string; sponsoredPos: string
  headline: string; copySource: string; city: string; edition: string
  subjects: { style: string; subject: string; preview: string }[]
  qa: { pass: boolean; errors: string[]; warnings: string[]; checks: string[] }
  sections: { placement: string; eventId: string; title: string; category: string; why: string[]; score: number; image: string | null }[]
}
type Row = { key: string; [k: string]: string | number }
type Stats = { totals: Record<string, number>; byPlacement: Row[]; byCategory: Row[]; bySubjectStyle: Row[]; byCta: Row[]; byCity: Row[]; bySponsoredPosition: Row[]; recent: { id: string; sentAt: string | null; city: string; status: string; subject: string; variant: string | null; clicks: number; opened: boolean; error: string | null }[] }

const TOTAL_LABELS: Record<string, string> = {
  sent: 'Sent', optedIn: 'Opted in', openRateApprox: 'Open rate ≈ %', ctr: 'CTR %', ctor: 'CTOR %', detailVisits: 'Detail visits',
  ticketReferrals: 'Ticket referrals', exploreClicks: 'Explore clicks', unsubscribes: 'Unsubscribes', repeatEngagers: 'Repeat engagers',
  skipped: 'Skipped (thin)', blocked: 'QA blocked', failed: 'Failed', tests: 'Tests',
}

function Table({ title, rows }: { title: string; rows: Row[] }) {
  if (!rows?.length) return null
  const cols = Object.keys(rows[0]).filter((k) => k !== 'key')
  return (
    <div className="rounded-xl bg-card shadow-sm p-4 overflow-x-auto">
      <h3 className="font-semibold mb-2 text-sm">{title}</h3>
      <table className="w-full text-xs">
        <thead><tr className="text-muted-foreground text-left"><th className="py-1 pr-3">Key</th>{cols.map((c) => <th key={c} className="py-1 pr-3">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-border/50"><td className="py-1 pr-3 font-medium">{r.key}</td>{cols.map((c) => <td key={c} className="py-1 pr-3">{r[c]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export function NewsletterAdminClient() {
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [edition, setEdition] = useState('')
  const [busy, setBusy] = useState<'' | 'preview' | 'test'>('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [built, setBuilt] = useState<Built | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [tab, setTab] = useState<'html' | 'text'>('html')

  const loadStats = () => fetch('/api/admin/newsletter').then(async (r) => {
    if (!r.ok) throw new Error(`Stats failed (${r.status})`)
    setStats(await r.json())
  }).catch((e) => console.error('[newsletter-admin] stats', e))

  useEffect(() => { loadStats() }, [])

  async function run(action: 'preview' | 'test') {
    setBusy(action); setMsg(null)
    try {
      const r = await fetch('/api/admin/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, email: email || undefined, city: city || undefined, edition: edition || undefined }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        console.error('[newsletter-admin]', action, j)
        setMsg({ ok: false, text: j.error ?? `Request failed (${r.status})` })
        if (j.qa) setBuilt((b) => (b ? { ...b, qa: j.qa } : b))
        return
      }
      if (action === 'preview') { setBuilt(j); setMsg({ ok: true, text: 'Preview built — nothing was sent.' }) }
      else { setMsg({ ok: true, text: j.disabled ? 'Email sending is disabled in this environment.' : `Test sent to ${j.to}: “${j.subject}”` }); loadStats() }
    } catch (e) {
      console.error('[newsletter-admin]', e)
      setMsg({ ok: false, text: 'Network error — please try again.' })
    } finally { setBusy('') }
  }

  const field = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm'
  return (
    <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold">The Weekender — newsletter</h1>
        <p className="text-muted-foreground text-sm mt-1">Preview any subscriber’s issue, run QA, send yourself a test, and track performance.</p>
      </header>

      <section className="rounded-2xl bg-card shadow-sm p-5 grid gap-4 md:grid-cols-4 items-end">
        <label className="text-sm md:col-span-2">Subscriber email <span className="text-muted-foreground">(blank = you)</span>
          <input className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="subscriber@example.com" />
        </label>
        <label className="text-sm">City
          <select className={field} value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Subscriber’s city</option>
            {CITY_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-sm">Edition
          <select className={field} value={edition} onChange={(e) => setEdition(e.target.value)}>
            <option value="">Subscriber’s frequency</option>
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
        </label>
        <div className="md:col-span-4 flex flex-wrap gap-3">
          <button onClick={() => run('preview')} disabled={!!busy} className="rounded-full bg-foreground text-background px-5 py-2 text-sm font-semibold disabled:opacity-50">{busy === 'preview' ? 'Building…' : 'Preview issue'}</button>
          <button onClick={() => run('test')} disabled={!!busy} className="rounded-full bg-[#FF4E6A] text-white px-5 py-2 text-sm font-semibold disabled:opacity-50">{busy === 'test' ? 'Sending…' : 'Send test to me'}</button>
        </div>
        {msg && <p className={`md:col-span-4 text-sm ${msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>}
      </section>

      {built && (
        <section className="grid gap-6 lg:grid-cols-[1fr_660px]">
          <div className="space-y-4 min-w-0">
            <div className="rounded-xl bg-card shadow-sm p-4">
              <h3 className="font-semibold text-sm mb-2">Subject lines <span className="text-muted-foreground font-normal">(copy: {built.copySource}, CTA {built.cta}, sponsored {built.sponsoredPos})</span></h3>
              <ul className="space-y-2 text-sm">{built.subjects.map((s) => (
                <li key={s.style} className={s.style === built.chosen ? 'font-semibold' : ''}>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground mr-2">{s.style}{s.style === built.chosen ? ' ✓' : ''}</span>{s.subject}
                  <div className="text-xs text-muted-foreground font-normal">{s.preview}</div>
                </li>))}</ul>
              <p className="text-xs text-muted-foreground mt-3">Headline: {built.headline}</p>
            </div>
            <div className="rounded-xl bg-card shadow-sm p-4 text-sm">
              <h3 className="font-semibold mb-2">QA — <span className={built.qa.pass ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{built.qa.pass ? 'pass' : 'blocked'}</span></h3>
              {built.qa.errors.map((e) => <p key={e} className="text-red-600 dark:text-red-400">✕ {e}</p>)}
              {built.qa.warnings.map((w) => <p key={w} className="text-amber-700 dark:text-amber-400">! {w}</p>)}
              <details className="mt-2"><summary className="cursor-pointer text-muted-foreground">{built.qa.checks.length} checks passed</summary>
                {built.qa.checks.map((c) => <p key={c} className="text-xs text-muted-foreground">✓ {c}</p>)}</details>
            </div>
            <div className="rounded-xl bg-card shadow-sm p-4 text-sm">
              <h3 className="font-semibold mb-2">Why these events</h3>
              <ul className="space-y-2">{built.sections.map((s) => (
                <li key={s.placement + s.eventId}>
                  <span className="text-xs uppercase tracking-wide text-[#FF4E6A] mr-2">{s.placement}</span>
                  <a href={`/events/${s.eventId}`} target="_blank" rel="noreferrer" className="underline">{s.title}</a>
                  <span className="text-xs text-muted-foreground"> · {s.category} · score {s.score}{s.image ? '' : ' · fallback art'}</span>
                  {s.why.length > 0 && <div className="text-xs text-muted-foreground">{s.why.join(' · ')}</div>}
                </li>))}</ul>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex gap-2 mb-2">
              {(['html', 'text'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1 text-xs font-semibold ${tab === t ? 'bg-foreground text-background' : 'bg-muted'}`}>{t === 'html' ? 'HTML' : 'Plain text'}</button>)}
            </div>
            {tab === 'html'
              ? <iframe title="Newsletter preview" srcDoc={built.html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="w-full max-w-[640px] h-[1400px] rounded-xl bg-white shadow" />
              : <pre className="whitespace-pre-wrap text-xs rounded-xl bg-card shadow-sm p-4 max-h-[1400px] overflow-auto">{built.text}</pre>}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between"><h2 className="font-display text-xl font-bold">Performance · last 90 days</h2>
          <button onClick={loadStats} className="text-sm underline">Refresh</button></div>
        {!stats ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {Object.entries(TOTAL_LABELS).map(([k, label]) => (
                <div key={k} className="rounded-xl bg-card shadow-sm p-3"><div className="text-xl font-bold">{stats.totals[k] ?? 0}</div><div className="text-xs text-muted-foreground">{label}</div></div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Opens are approximate (image-blocking and privacy proxies distort them). Delivery, bounce and spam-complaint data aren’t available from the email service.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Table title="Clicks by placement" rows={stats.byPlacement} />
              <Table title="Clicks by category" rows={stats.byCategory} />
              <Table title="Subject style experiment" rows={stats.bySubjectStyle} />
              <Table title="CTA experiment" rows={stats.byCta} />
              <Table title="By city" rows={stats.byCity} />
              <Table title="Sponsored position" rows={stats.bySponsoredPosition} />
            </div>
            {stats.recent.length > 0 && (
              <Table title="Recent issues" rows={stats.recent.map((r) => ({ key: r.sentAt ? new Date(r.sentAt).toISOString().slice(0, 16).replace('T', ' ') : r.id, city: r.city, status: r.status, subject: r.subject, style: r.variant ?? '', clicks: r.clicks, opened: r.opened ? 'yes' : '', error: r.error ?? '' }))} />
            )}
          </>
        )}
      </section>
    </main>
  )
}
