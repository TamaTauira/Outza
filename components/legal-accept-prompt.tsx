'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'

type Missing = { doc: string; version: string; title: string; path: string }

let remembered: Missing[] | null = null

/** Asks a signed-in person to accept a material legal update. Does not record anything until they press accept. */
export function LegalAcceptPrompt() {
  const { status } = useSession()
  const [missing, setMissing] = useState<Missing[] | null>(remembered)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status !== 'authenticated') {
      remembered = null
      setMissing(null)
      return
    }
    if (remembered) {
      setMissing(remembered)
      return
    }
    let cancelled = false
    fetch('/api/legal/status')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data?.pendingMigration) return
        const next = Array.isArray(data?.missing) ? data.missing : []
        remembered = next
        setMissing(next)
      })
      .catch(() => {
        if (!cancelled) setMissing([])
      })
    return () => { cancelled = true }
  }, [status])

  if (!missing?.length) return null

  const accept = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/legal/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ context: 'login' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Could not record that.')
        return
      }
      remembered = []
      setMissing([])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="legal-accept-title">
      <div className="w-full max-w-lg rounded-3xl bg-card p-6 shadow-[var(--vp-shadow-lg)]">
        <h2 id="legal-accept-title" className="font-display text-2xl font-bold">Please accept the updated terms</h2>
        <p className="mt-2 text-sm text-muted-foreground">These versions apply to your account when you accept them. Keeping the site open is not agreement. This notice stays in the product. We do not email it.</p>
        <ul className="mt-3 space-y-1 text-sm">
          {missing.map((item) => (
            <li key={item.doc}>
              <Link href={item.path} className="underline underline-offset-2" target="_blank">{item.title}</Link>
              <span className="text-muted-foreground"> · version {item.version}</span>
            </li>
          ))}
        </ul>
        {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={accept} disabled={busy} className="h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">I accept</button>
          <button type="button" onClick={() => signOut({ callbackUrl: '/' })} className="h-11 rounded-full bg-muted px-5 text-sm font-semibold">Sign out</button>
        </div>
      </div>
    </div>
  )
}
