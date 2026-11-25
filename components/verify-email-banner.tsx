'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Loader2 } from 'lucide-react'

function promoterSurface(pathname: string): boolean {
  return pathname.startsWith('/promoter') || pathname.startsWith('/venue') || /\/events\/[^/]+\/manage/.test(pathname)
}

/** Shown to a signed-in person until their email is verified. Browsing stays open. */
export function VerifyEmailBanner({ embed = false }: { embed?: boolean }) {
  const pathname = usePathname() || ''
  const { data, status } = useSession()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const onPromoter = promoterSurface(pathname)
  if (onPromoter !== embed) return null
  if (status !== 'authenticated' || !data?.user?.id || data.user.verified) return null

  async function resend() {
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resend: true }),
      })
      const body = await res.json().catch(() => ({}))
      if (body.already) setNote('This email is already verified.')
      else if (body.limited) setNote('A link was sent recently. Check your inbox, then try again in an hour.')
      else if (body.sent) setNote('Link sent. Check your inbox.')
      else setNote('We couldn’t send just now. Try again shortly.')
    } catch {
      setNote('We couldn’t send just now. Try again shortly.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-border bg-primary/10 py-2 text-sm text-foreground">
      <div className="vp-wrap flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
        <p>{data.user.role === 'PROMOTER' || data.user.role === 'ADMIN' ? 'Verify your email to publish events and run campaigns.' : 'Confirm your email so we can send reminders. You can keep browsing and saving.'}</p>
        <button type="button" onClick={resend} disabled={busy} className="inline-flex h-9 items-center font-semibold text-primary underline disabled:opacity-60">
          {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Send the link again
        </button>
      </div>
      {note && <p className="vp-wrap mt-1 px-4 text-xs sm:px-6" role="status">{note}</p>}
    </div>
  )
}
