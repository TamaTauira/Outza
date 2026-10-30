'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function VerifyInner() {
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [state, setState] = useState<'working' | 'ok' | 'bad'>('working')
  const [result, setResult] = useState<{ path?: string; managePath?: string; posterPath?: string; approvalState?: string; error?: string }>({})

  useEffect(() => {
    if (!token) { setState('bad'); setResult({ error: 'That link is missing its token.' }); return }
    let cancel = false
    fetch('/api/community/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancel) return
        setResult(j)
        setState(ok ? 'ok' : 'bad')
      })
      .catch(() => { if (!cancel) setState('bad') })
    return () => { cancel = true }
  }, [token])

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      {state === 'working' && <p className="text-base">Checking that link…</p>}
      {state === 'bad' && <p className="text-base">{result.error || 'That link has expired. Ask for a fresh code from the listing form.'}</p>}
      {state === 'ok' && (
        <div className="space-y-4">
          <h1 className="font-display text-3xl font-bold">{result.approvalState === 'APPROVED' ? 'You’re on the board.' : 'Confirmed. A person will take a look.'}</h1>
          <div className="flex flex-col gap-3">
            {result.path && <Link href={result.path} className="inline-flex h-12 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">More Info</Link>}
            {result.posterPath && <Link href={result.posterPath} className="inline-flex h-12 items-center justify-center rounded-full border border-border font-semibold">Printable poster</Link>}
            {result.managePath && <Link href={result.managePath} className="font-semibold text-primary underline">Edit this listing</Link>}
          </div>
        </div>
      )}
    </main>
  )
}

export function CommunityVerifyClient() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-xl px-4 py-10">Checking that link…</main>}>
      <VerifyInner />
    </Suspense>
  )
}
