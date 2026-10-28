'use client'

import { useEffect, useState } from 'react'

interface LocalTime { hh: string; mm: string; ampm: string; zone: string; place: string }

function readLocal(): LocalTime {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' }).formatToParts(new Date())
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const place = (tz.split('/').pop() || tz).replace(/_/g, ' ')
  return { hh: g('hour'), mm: g('minute'), ampm: g('dayPeriod').toUpperCase(), zone: g('timeZoneName'), place }
}

/** Live clock in the visitor's own timezone (detected from their device). */
export function LocalClock({ className }: { className?: string }) {
  const [t, setT] = useState<LocalTime | null>(null)
  useEffect(() => {
    setT(readLocal())
    const id = setInterval(() => setT(readLocal()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className={className} aria-live="off">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">
        {t && t.zone !== t.place ? t.zone : t ? '' : 'Local'} <span className={t && t.zone === t.place ? 'text-primary' : 'text-primary ml-2'}>{t ? `${t.place} time` : 'your time'}</span>
      </div>
      <div className="font-mono font-bold tabular-nums leading-none mt-1.5 text-white">
        <span className="text-2xl sm:text-[40px]">{t ? `${t.hh}:${t.mm}` : '--:--'}</span>
        <span className="ml-1 text-sm">{t?.ampm ?? ''}</span>
      </div>
    </div>
  )
}
