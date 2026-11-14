'use client'

import { useEffect } from 'react'
import { reportCrash } from '@/components/report-crash'
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
      <body style={{ fontFamily: 'Arial, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#fff', color: '#111' }}>
        <div style={{ textAlign: 'center', maxWidth: 440, padding: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900 }}>{network ? 'The signal dropped.' : 'Well, that wasn\'t on the programme.'}</h1>
          <p style={{ color: '#555' }}>{network ? 'VibePeep is fine. The connection blinked. Give it another go?' : 'VibePeep blinked. We\'ve already been told and we\'re on it.'}</p>
          <button onClick={() => reset()} style={{ marginTop: 12, padding: '10px 20px', borderRadius: 8, border: 0, background: '#E24B2A', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{network ? 'Try again' : 'Try Again'}</button>
        </div>
      </body>
    </html>
  )
}
