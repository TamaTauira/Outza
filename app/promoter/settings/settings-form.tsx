'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'

const field = 'mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm'

export function SettingsForm({ email, orgName, bio, website, hasPassword }: {
  email: string
  orgName: string
  bio: string
  website: string
  hasPassword: boolean
}) {
  const [profile, setProfile] = useState({ orgName, bio, website })
  const [password, setPassword] = useState({ current: '', next: '' })
  const [closeEmail, setCloseEmail] = useState('')
  const [busy, setBusy] = useState('')

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy('profile')
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(profile),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not save those details')
      toast.success('Promoter profile saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save those details')
    } finally { setBusy('') }
  }

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy('password')
    try {
      const res = await fetch('/api/me/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(password),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not change the password')
      setPassword({ current: '', next: '' })
      toast.success('Password updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change the password')
    } finally { setBusy('') }
  }

  const closeAccount = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!window.confirm('Close this account? This cannot be undone.')) return
    setBusy('close')
    try {
      const res = await fetch('/api/me/close', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: closeEmail }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not close the account')
      await signOut({ redirectTo: '/' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not close the account')
      setBusy('')
    }
  }

  return (
    <main className="vp-wrap vp-page-top vp-stack px-4 pb-16 sm:px-6">
      <div>
        <p className="text-xs font-semibold text-primary">Promoter</p>
        <h1 className="mt-1 font-display text-h1">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">{email}</p>
      </div>

      <form onSubmit={saveProfile} className="max-w-xl rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-semibold">Promoter profile</h2>
        <label className="mt-4 block text-sm font-medium">Organisation name
          <input value={profile.orgName} onChange={(e) => setProfile({ ...profile, orgName: e.target.value })} className={field} maxLength={120} />
        </label>
        <label className="mt-3 block text-sm font-medium">Website
          <input value={profile.website} onChange={(e) => setProfile({ ...profile, website: e.target.value })} className={field} placeholder="https://" />
        </label>
        <label className="mt-3 block text-sm font-medium">About
          <textarea value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={4} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <button disabled={busy === 'profile'} className="mt-4 h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy === 'profile' ? 'Saving…' : 'Save profile'}</button>
      </form>

      {hasPassword && (
        <form onSubmit={savePassword} className="max-w-xl rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Password</h2>
          <label className="mt-4 block text-sm font-medium">Current password
            <input type="password" autoComplete="current-password" value={password.current} onChange={(e) => setPassword({ ...password, current: e.target.value })} className={field} />
          </label>
          <label className="mt-3 block text-sm font-medium">New password
            <input type="password" autoComplete="new-password" value={password.next} onChange={(e) => setPassword({ ...password, next: e.target.value })} className={field} />
          </label>
          <button disabled={busy === 'password'} className="mt-4 h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy === 'password' ? 'Saving…' : 'Update password'}</button>
        </form>
      )}

      <form onSubmit={closeAccount} className="max-w-xl rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-semibold">Close account</h2>
        <p className="mt-1 text-sm text-muted-foreground">This deletes the account. Type the account email to confirm.</p>
        <label className="mt-3 block text-sm font-medium">Account email
          <input type="email" value={closeEmail} onChange={(e) => setCloseEmail(e.target.value)} className={field} autoComplete="off" />
        </label>
        <button disabled={busy === 'close'} className="mt-4 h-11 rounded-md border border-border px-4 text-sm font-semibold disabled:opacity-60">Close account</button>
      </form>
    </main>
  )
}
