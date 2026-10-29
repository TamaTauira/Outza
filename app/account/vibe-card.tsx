'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VIBE_BIO_MAX, VIBE_QUESTIONS, asVibe, cleanVibe, vibeProgress, type VibeKey, type VibeProfile } from '@/lib/vibe-shared'

const chip = (on: boolean) => cn('px-3 min-h-9 py-1.5 rounded-full text-xs sm:text-sm border transition-colors text-left', on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')

/** Optional "vibe" questions. Saved together with one button so tapping around doesn't spam saves. */
export function VibeCard({ initial, onSaved }: { initial: unknown; onSaved: (v: VibeProfile | null) => void }) {
  const start = useMemo(() => asVibe(initial), [initial])
  const [vibe, setVibe] = useState<VibeProfile>(start)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setVibe(start) }, [start])

  const dirty = JSON.stringify(cleanVibe(vibe)) !== JSON.stringify(cleanVibe(start))
  const { done, total } = vibeProgress(vibe)

  const toggle = (key: VibeKey, multi: boolean, opt: string) => setVibe((v) => {
    const cur = v[key] ?? []
    const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : multi ? [...cur, opt] : [opt]
    return { ...v, [key]: next }
  })

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vibeProfile: vibe }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Could not save')
      onSaved(d.user?.vibeProfile ?? null)
      toast.success('Vibe locked in. Your picks just got smarter.')
    } catch (err) { console.error('Vibe save failed:', err); toast.error(err instanceof Error ? err.message : 'Could not save') } finally { setSaving(false) }
  }

  return (
    <section id="vibe" className="rounded-xl bg-card border border-border p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Your vibe</h2>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Optional</span>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Every question here is optional. Answer as many as you like to get the best experience from VibePeep: the more we know your vibe, the sharper your picks.
      </p>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>{done} of {total} answered</span>{done === total && <span className="text-primary font-semibold">Full vibe unlocked</span>}</div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} /></div>
      </div>

      <div className="mt-5 space-y-5">
        <div>
          <label htmlFor="vibe-bio" className="text-sm font-medium">Your vibe in one line</label>
          <textarea id="vibe-bio" rows={2} maxLength={VIBE_BIO_MAX} value={vibe.bio ?? ''} onChange={(e) => setVibe((v) => ({ ...v, bio: e.target.value }))}
            placeholder="e.g. Sunday markets, dumplings, then a sneaky gig" className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none" />
          <p className="text-xs text-muted-foreground text-right">{(vibe.bio ?? '').length}/{VIBE_BIO_MAX}</p>
        </div>

        {VIBE_QUESTIONS.map((q) => (
          <fieldset key={q.key}>
            <legend className="text-sm font-medium">{q.label} <span className="text-xs font-normal text-muted-foreground">{q.multi ? '(pick any)' : '(pick one)'}</span></legend>
            <div className="flex flex-wrap gap-2 mt-2">
              {q.options.map((o) => {
                const on = (vibe[q.key] ?? []).includes(o)
                return <button key={o} type="button" aria-pressed={on} onClick={() => toggle(q.key, q.multi, o)} className={chip(on)}>{o}</button>
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <button type="button" onClick={save} disabled={saving || !dirty} className="h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save My Vibe
        </button>
      </div>
    </section>
  )
}
