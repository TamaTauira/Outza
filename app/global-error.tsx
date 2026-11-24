'use client'

import { useEffect } from 'react'
import { reportCrash } from '@/components/report-crash'
import { BRAND_ON_PRIMARY, BRAND_ORANGE } from '@/lib/brand'
import { claimNetworkRetry, isBareNetworkFault } from '@/lib/network-fault'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const network = isBareNetworkFault(error)
  // reportCrash reloads once for a chunk-load failure and skips the fault email until that reload still fails.
  // A stackless fetch failure retries once, then stays on this quiet message instead of a page-crash alert.
  useEffect(() => {
    reportCrash(error)
    if (!network) return
    const storage = typeof sessionStorage === 'undefined' ? null : sessionStorage
    if (claimNetworkRetry(storage)) reset()
  }, [error, network, reset])
  return (
    <html lang="en">
      <body style={{ fontFamily: 'Inter, Arial, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0, background: 'white', color: 'black' }}>
        <div style={{ textAlign: 'center', maxWidth: 440, padding: 24 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700 }}>{network ? 'The signal dropped.' : 'Well, that wasn\'t on the programme.'}</h1>
          <p style={{ color: 'rgb(85, 85, 85)' }}>{network ? 'VibePeep is fine. The connection blinked. Give it another go?' : 'VibePeep blinked. We\'ve already been told and we\'re on it.'}</p>
          <button onClick={() => reset()} style={{ marginTop: 16, minHeight: 44, padding: '10px 20px', borderRadius: 999, border: 0, background: BRAND_ORANGE, color: BRAND_ON_PRIMARY, fontWeight: 700, cursor: 'pointer' }}>{network ? 'Try again' : 'Try again'}</button>
        </div>
      </body>
    </html>
  )
}
