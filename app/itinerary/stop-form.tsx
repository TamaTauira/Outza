'use client'

import { useState } from 'react'

export type StopFormValues = { title: string; date: string; time: string; endTime: string; where: string; note: string }
export const emptyStop: StopFormValues = { title: '', date: '', time: '', endTime: '', where: '', note: '' }

const field = 'h-10 rounded-md border border-border bg-background px-3 text-sm'

/** Add / edit form for the visitor's own stops. Start and end times are both required. */
export function StopForm({ initial, submitLabel, onSubmit, onCancel, keepDate }: {
  initial: StopFormValues
  submitLabel: string
  onSubmit: (v: StopFormValues) => void
  onCancel?: () => void
  /** After adding, keep the date so the next stop is quicker to add. */
  keepDate?: boolean
}) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof StopFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.date) return setError('Give your stop a name and a date.')
    if (!form.time || !form.endTime) return setError('Pop in a start and end time so we can line up your night.')
    if (form.endTime === form.time) return setError('Your end time matches your start time. Give it at least a minute!')
    setError(null)
    onSubmit({ ...form, title: form.title.trim().slice(0, 120), where: form.where.trim().slice(0, 160), note: form.note.trim().slice(0, 300) })
    if (keepDate) setForm({ ...emptyStop, date: form.date })
  }

  return (
    <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
      <input required value={form.title} onChange={set('title')} placeholder="e.g. Dinner at Chinatown" className={`${field} sm:col-span-2`} aria-label="Stop name" />
      <label className="text-xs text-muted-foreground">Date<input required type="date" value={form.date} onChange={set('date')} className={`${field} mt-1 w-full text-foreground`} aria-label="Date" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-muted-foreground">Starts<input required type="time" value={form.time} onChange={set('time')} className={`${field} mt-1 w-full text-foreground`} aria-label="Start time" /></label>
        <label className="text-xs text-muted-foreground">Ends<input required type="time" value={form.endTime} onChange={set('endTime')} className={`${field} mt-1 w-full text-foreground`} aria-label="End time" /></label>
      </div>
      {form.time && form.endTime && form.endTime < form.time && <p className="sm:col-span-2 text-xs text-muted-foreground">Ends after midnight? Night owl energy. We&apos;ll count it as finishing the next morning.</p>}
      {error && <p role="alert" className="sm:col-span-2 text-xs text-destructive">{error}</p>}
      <input value={form.where} onChange={set('where')} placeholder="Where (address or place, for travel times)" className={`${field} sm:col-span-2`} aria-label="Where" />
      <input value={form.note} onChange={set('note')} placeholder="Note (optional)" className={`${field} sm:col-span-2`} aria-label="Note" />
      <div className={`sm:col-span-2 grid gap-3 ${onCancel ? 'grid-cols-2' : ''}`}>
        {onCancel && <button type="button" onClick={onCancel} className="h-10 rounded-md border border-border text-sm font-semibold hover:bg-muted">Cancel</button>}
        <button type="submit" className="h-10 rounded-md bg-primary text-primary-foreground font-semibold text-sm">{submitLabel}</button>
      </div>
    </form>
  )
}
