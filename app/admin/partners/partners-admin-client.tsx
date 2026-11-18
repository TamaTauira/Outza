'use client'

import { useState } from 'react'
import { SOURCE_REGISTER } from '@/lib/sources/register'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type SourceRow = { sourceKey: string; hostPatterns: string[] }
type PartnerRow = {
  id: string
  email: string
  name: string | null
  displayName: string
  sources: SourceRow[]
  createdAt: string
}

const CHOICES = SOURCE_REGISTER.filter((row) => row.status === 'integrated' || row.status === 'partial' || row.status === 'queued')

export function PartnersAdminClient({ initial }: { initial: PartnerRow[] }) {
  const [partners, setPartners] = useState(initial)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [hosts, setHosts] = useState('')
  const [customKey, setCustomKey] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState('')
  const [saving, setSaving] = useState(false)

  function toggle(key: string) {
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }

  function load(row: PartnerRow) {
    setEmail(row.email)
    setName(row.name ?? '')
    setDisplayName(row.displayName)
    setPassword('')
    setSelected(row.sources.map((source) => source.sourceKey))
    setHosts([...new Set(row.sources.flatMap((source) => source.hostPatterns))].join(', '))
    setCustomKey('')
    setMessage(`Editing ${row.email}. Saving replaces the source list. Leave the password blank to keep the current one.`)
    setError('')
    setRevealed('')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    setRevealed('')
    const keys = [...selected]
    const extra = customKey.trim().toLowerCase()
    if (extra && !keys.includes(extra)) keys.push(extra)
    const hostPatterns = hosts.split(/[\s,]+/).map((host) => host.trim()).filter(Boolean)
    const res = await fetch('/api/admin/partners', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, name, displayName, password,
        sources: keys.map((sourceKey) => ({ sourceKey, hostPatterns })),
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Could not save that partner'); return }
    if (typeof data.password === 'string' && data.password) setRevealed(data.password)
    setMessage(data.created ? `Created ${data.email}.` : `Updated ${data.email}.`)
    const fresh = await fetch('/api/admin/partners').then((r) => r.ok ? r.json() : null)
    if (fresh?.partners) setPartners(fresh.partners)
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="font-display text-xl font-bold">Create or link a partner</h2>
        <p className="text-sm text-muted-foreground">There is no public sign-up. A new email gets a partner login. An existing event-goer email is switched to partner and linked to these sources. Promoter and admin emails are left alone.</p>
        <div className="space-y-1.5">
          <Label htmlFor="partner-email">Email</Label>
          <Input id="partner-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="partner-name">Contact name</Label>
          <Input id="partner-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="partner-display">Name on the overview</Label>
          <Input id="partner-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ticketmaster" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="partner-password">Password</Label>
          <Input id="partner-password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 10 characters" />
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const bytes = new Uint8Array(18)
            crypto.getRandomValues(bytes)
            setPassword(btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
          }}>Generate a password</Button>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Sources</legend>
          <div className="grid max-h-64 gap-1 overflow-auto sm:grid-cols-2">
            {CHOICES.map((row) => (
              <label key={row.id} className="flex items-start gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted">
                <input type="checkbox" className="mt-1" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} />
                <span>{row.name}<span className="block text-xs text-muted-foreground">{row.id}</span></span>
              </label>
            ))}
          </div>
          <Label htmlFor="partner-custom">Other source key</Label>
          <Input id="partner-custom" value={customKey} onChange={(e) => setCustomKey(e.target.value)} placeholder="ticketmaster" />
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="partner-hosts">Link hosts, optional</Label>
          <Input id="partner-hosts" value={hosts} onChange={(e) => setHosts(e.target.value)} placeholder="ticketmaster.com, ticketmaster.com.au" />
          <p className="text-xs text-muted-foreground">Listings whose ticket or source link uses one of these hosts are included as well. www is ignored.</p>
        </div>
        {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
        {message ? <p className="text-sm" role="status">{message}</p> : null}
        {revealed ? <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm" role="status">Password, shown once: {revealed}</p> : null}
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save partner'}</Button>
      </form>
      <section>
        <h2 className="font-display text-xl font-bold">Partner logins</h2>
        {partners.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">None yet.</p> : (
          <ul className="mt-3 space-y-3">
            {partners.map((row) => (
              <li key={row.id} className="rounded-xl border border-border bg-card p-4">
                <p className="font-semibold">{row.displayName}</p>
                <p className="text-sm text-muted-foreground">{row.email}</p>
                <p className="mt-1 text-sm">{row.sources.map((source) => source.sourceKey).join(', ') || 'No source'}</p>
                {row.sources.some((source) => source.hostPatterns.length) ? (
                  <p className="text-xs text-muted-foreground">{row.sources.flatMap((source) => source.hostPatterns).join(', ')}</p>
                ) : null}
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => load(row)}>Edit sources</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
