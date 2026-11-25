'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { PageHeading } from '@/components/page-heading'
import { Button } from '@/components/ui/button'

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

  const title = state === 'ok'
    ? (result.approvalState === 'APPROVED' ? 'You’re on the board.' : 'Confirmed. A person will take a look.')
    : 'Confirm your listing'
  return (
    <main className="vp-page-top mx-auto max-w-xl px-4 pb-16">
      <div className="rounded-card border border-border bg-card p-6 shadow-vp-sm">
        <PageHeading>{title}</PageHeading>
        {state === 'working' && <p className="mt-3 text-sm text-muted-foreground">Checking that link…</p>}
        {state === 'bad' && <p className="mt-3 text-sm text-muted-foreground" role="alert">{result.error || 'That link has expired. Ask for a fresh code from the listing form.'}</p>}
        {state === 'ok' && (
          <div className="mt-4 flex flex-col gap-3">
            {result.path && <Button asChild><Link href={result.path}>See the listing</Link></Button>}
            {result.posterPath && <Button asChild variant="outline"><Link href={result.posterPath}>Printable poster</Link></Button>}
            {result.managePath && <Link href={result.managePath} className="font-semibold text-primary underline">Edit this listing</Link>}
          </div>
        )}
        <p className="mt-4 text-sm"><Link href="/local" className="font-semibold text-primary underline">Back to Local</Link></p>
      </div>
    </main>
  )
}

export function CommunityVerifyClient() {
  return (
    <Suspense fallback={<main className="vp-page-top mx-auto max-w-xl px-4 pb-10">Checking that link…</main>}>
      <VerifyInner />
    </Suspense>
  )
}
