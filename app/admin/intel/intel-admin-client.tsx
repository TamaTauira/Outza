'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Play } from 'lucide-react'
import { INTEL_SOURCES, type SourceKey } from '@/lib/intel/sources'

type Src = { key: SourceKey; status: string; lastCheckedAt: string | null; lastSuccessAt: string | null; latestPeriod: string | null; obsCount: number; lastError: string | null; failCount: number }
type Job = { id: string; source: string; trigger: string; status: string; startedAt: string; rows: number; message: string | null }
const when = (d: string | null) => (d ? new Date(d).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'never')

export function IntelAdminClient() {
  const [sources, setSources] = useState<Src[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    try { const d = await fetch('/api/admin/intel').then((r) => r.json()); setSources(d.sources ?? []); setJobs(d.jobs ?? []) } catch (e) { console.error('[admin intel]', e) }
  }, [])
  useEffect(() => { load() }, [load])
  const run = async (source: SourceKey) => {
    setBusy(source)
    try {
      const r = await fetch('/api/admin/intel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`)
      toast(`${INTEL_SOURCES[source].name}: ${d.status}${d.message ? ` (${d.message})` : ''}`)
    } catch (e) { console.error('[admin intel run]', e); toast.error(e instanceof Error ? e.message : 'Run failed') } finally { setBusy(''); load() }
  }
  const byKey = new Map(sources.map((s) => [s.key, s]))

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">OUTZA Intelligence data sources</h1>
        <p className="text-muted-foreground mt-1">Official public data only. Each source runs on its own schedule (checked hourly). A failed import keeps the last good data.</p>
      </header>
      <section className="rounded-xl bg-card shadow-sm p-5 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="text-xs text-muted-foreground text-left"><th className="py-2 pr-3 font-medium">Source</th><th className="py-2 px-3 font-medium">Status</th><th className="py-2 px-3 font-medium">Last success</th><th className="py-2 px-3 font-medium">Latest data</th><th className="py-2 px-3 font-medium text-right">Rows</th><th className="py-2 pl-3" /></tr></thead>
          <tbody>
            {(Object.keys(INTEL_SOURCES) as SourceKey[]).map((k) => {
              const s = byKey.get(k), d = INTEL_SOURCES[k]
              return (
                <tr key={k} className="border-t border-border align-top">
                  <td className="py-3 pr-3"><b>{d.name}</b><span className="block text-[11px] text-muted-foreground">{d.scheduleLabel}</span></td>
                  <td className="py-3 px-3">{s?.status ?? 'never_run'}{s?.lastError && <span className="block text-[11px] text-muted-foreground max-w-xs">{s.lastError}</span>}</td>
                  <td className="py-3 px-3">{when(s?.lastSuccessAt ?? null)}</td>
                  <td className="py-3 px-3">{s?.latestPeriod ?? '—'}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{(s?.obsCount ?? 0).toLocaleString('en-AU')}</td>
                  <td className="py-3 pl-3 text-right"><button onClick={() => run(k)} disabled={!!busy} className="h-9 px-3 rounded-md border border-border text-sm font-medium inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50">{busy === k ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}Run Now</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      <section className="rounded-xl bg-card shadow-sm p-5">
        <h2 className="font-display text-lg font-bold">Recent import jobs</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {jobs.map((j) => <li key={j.id} className="py-2"><b>{INTEL_SOURCES[j.source as SourceKey]?.name ?? j.source}</b> <span className="text-muted-foreground">· {when(j.startedAt)} · {j.trigger} · {j.status}</span>{j.message && <span className="block text-xs text-muted-foreground">{j.message}</span>}</li>)}
          {!jobs.length && <li className="py-2 text-muted-foreground">No imports yet.</li>}
        </ul>
      </section>
    </main>
  )
}
