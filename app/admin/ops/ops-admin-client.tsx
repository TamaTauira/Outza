'use client'

import { useEffect, useState } from 'react'
import { VibePeepLogo } from '@/components/vibepeep-logo'
import { PageHeader } from '@/components/layout/page-header'
import { Surface } from '@/components/ui/surface'
import { Switch } from '@/components/ui/switch'
import type { OpsPageData } from '@/lib/ops/admin-data'
import type { Thresholds } from '@/lib/ops/types'

const when = (iso: string) => new Date(iso).toLocaleString('en-AU', {
  timeZone: 'Australia/Sydney',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

const THRESHOLD_FIELDS: { key: keyof Thresholds; label: string; hint: string }[] = [
  { key: 'duplicateLink', label: 'Link duplicates at', hint: 'Similarity at or above this links the row.' },
  { key: 'duplicateDismiss', label: 'Dismiss duplicates at', hint: 'Similarity at or below this leaves both public.' },
  { key: 'timeConflict', label: 'Time conflict confidence', hint: 'Below this, the item waits for Monday.' },
  { key: 'heldApprove', label: 'Publish a held listing at', hint: 'Model confidence required to show an ordinary listing.' },
]

export function OpsAdminClient() {
  const [data, setData] = useState<OpsPageData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [thresholds, setThresholds] = useState<Thresholds | null>(null)

  useEffect(() => {
    let cancel = false
    fetch('/api/admin/ops').then(async (res) => {
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not load')
      return json as OpsPageData
    }).then((page) => {
      if (cancel) return
      setData(page)
      setThresholds(page.thresholds)
    }).catch((err) => {
      if (!cancel) setError(err instanceof Error ? err.message : 'Could not load')
    })
    return () => { cancel = true }
  }, [])

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key)
    setError('')
    try {
      const res = await fetch('/api/admin/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not save')
      if (json.page) {
        setData(json.page)
        setThresholds(json.page.thresholds)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="vp-page-top mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
      <div className="mb-8">
        <VibePeepLogo size="sm" />
      </div>
      <PageHeader
        eyebrow="Admin"
        title="Operations"
        lede="Bots decide the clear cases and write down why. You get one email on Monday at 9:00 am AEDT when something is left. Every decision can be undone for 30 days. Nothing is deleted."
      />

      {error ? <p className="mt-6 text-sm text-destructive" role="alert">{error}</p> : null}
      {!data || !thresholds ? (
        <p className="mt-10 text-sm text-muted-foreground">{error ? '' : 'Loading decisions.'}</p>
      ) : (
      <>
      <section className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="This week">
        <Stat label="Waiting on you" value={data.openDigest} />
        <Stat label="Bots handled" value={data.handledWeek} note="Last 7 days" />
        <Stat label="Undone" value={data.undone} note="All time" />
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl tracking-tight">Rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">On by default. Turning one off leaves those items for the Monday email.</p>
        <Surface className="mt-4 divide-y divide-border px-0 py-0">
          {data.rules.map((rule) => (
            <div key={rule.key} className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
              <span className="text-sm">{rule.label}</span>
              <Switch
                checked={rule.enabled}
                disabled={busy === rule.key}
                aria-label={rule.label}
                onCheckedChange={(enabled) => post({ action: 'settings', key: rule.key, enabled }, rule.key)}
              />
            </div>
          ))}
        </Surface>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl tracking-tight">Confidence</h2>
        <Surface className="mt-4 space-y-5">
          {THRESHOLD_FIELDS.map((field) => (
            <label key={field.key} className="block">
              <span className="text-sm">{field.label}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{field.hint}</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                inputMode="decimal"
                value={thresholds[field.key]}
                onChange={(event) => setThresholds({ ...thresholds, [field.key]: Number(event.target.value) })}
                className="mt-2 h-11 w-28 rounded-xl border border-border bg-background px-3 text-base tabular-nums"
              />
            </label>
          ))}
          <button
            type="button"
            disabled={busy === 'thresholds'}
            onClick={() => post({ action: 'settings', key: 'thresholds', thresholds }, 'thresholds')}
            className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-50"
          >
            Save thresholds
          </button>
        </Surface>
      </section>

      {data.byKind.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl tracking-tight">By kind</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {data.byKind.map((row) => (
              <li key={row.kind} className="rounded-full border border-border px-3 py-1.5 text-sm tabular-nums">
                {row.kind.replace(/_/g, ' ').toLowerCase()} · {row.count}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="font-display text-xl tracking-tight">Recent decisions</h2>
        <p className="mt-1 text-sm text-muted-foreground">The latest 50. Undo puts the listing back the way it was.</p>
        {data.decisions.length === 0 ? (
          <Surface tone="muted" className="mt-4">
            <p className="text-sm text-muted-foreground">No decisions yet. The next quality run will start on new items only. The older backlog stays in the dry-run report.</p>
          </Surface>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {data.decisions.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm leading-snug">{row.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {when(row.createdAt)} AEDT · {row.actor} · {Math.round(row.confidence * 100)}% · {row.action}
                    {row.undoneAt ? ' · undone' : ''}
                  </p>
                </div>
                {row.undoable ? (
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => post({ action: 'undo', id: row.id }, row.id)}
                    className="inline-flex h-11 shrink-0 items-center rounded-full border border-border px-4 text-sm font-semibold"
                  >
                    Undo
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      </>
      )}
    </main>
  )
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <Surface pad="sm" className="min-h-[6.5rem]">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums tracking-tight">{value.toLocaleString('en-AU')}</p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </Surface>
  )
}
