'use client'

import { useEffect } from 'react'
import { reportCrash } from '@/components/report-crash'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportCrash(error) }, [error])
  return (
    <html lang="en">
      <body style={{ fontFamily: 'Arial, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#fff', color: '#111' }}>
        <div style={{ textAlign: 'center', maxWidth: 440, padding: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900 }}>Well, that wasn&apos;t on the programme.</h1>
          <p style={{ color: '#555' }}>VibePeep blinked. We&apos;ve already been told and we&apos;re on it.</p>
          <button onClick={() => reset()} style={{ marginTop: 12, padding: '10px 20px', borderRadius: 8, border: 0, background: '#E24B2A', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Try Again</button>
        </div>
      </body>
    </html>
  )
}
