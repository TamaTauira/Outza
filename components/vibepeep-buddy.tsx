'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BRAND_MASCOT_SRC } from '@/lib/brand'
import { VibePeepMascot } from '@/components/vibepeep-mascot'
import { attachRoam } from '@/components/vibepeep-roam'
import './vibepeep-roam.css'

const KEY = 'vibepeep-buddy-minimised'

function readMinimised() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** The one living mascot. He walks the viewport; the homepage does not also show a hero. */
export function VibePeepBuddy() {
  const path = usePathname()
  const onMap = path === '/map'
  // null until after mount so server and client render the same tree.
  const [minimised, setMinimised] = useState<boolean | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMinimised(readMinimised())
  }, [])

  const save = (next: boolean) => {
    setMinimised(next)
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch { /* private mode */ }
  }

  useEffect(() => {
    const root = rootRef.current
    if (!root || minimised !== false) return
    return attachRoam(root)
  }, [minimised, onMap])

  if (minimised === null) return null

  if (minimised) {
    return (
      <div key="parked" className={`vp-roam vp-roam-parked pointer-events-none ${onMap ? 'vp-roam-map' : ''}`}>
        <button
          type="button"
          className="vp-buddy-mini vp-roam-show"
          aria-label="Show VibePeep"
          aria-expanded={false}
          onClick={() => save(false)}
        >
          <img src={BRAND_MASCOT_SRC} alt="" width={40} height={40} draggable={false} />
          <span>VibePeep</span>
        </button>
      </div>
    )
  }

  return (
    <div className="vp-buddy-anchor">
      <div
        key="roam"
        ref={rootRef}
        className={`vp-roam pointer-events-none ${onMap ? 'vp-roam-map' : ''}`}
        data-map={onMap ? '1' : undefined}
        data-face="right"
      >
        <div className="vp-roam-body">
          <span className="vp-shadow" aria-hidden="true" />
          <div className="vp-actor">
            <VibePeepMascot
              rig
              className="w-full"
              bubble="start"
              alt="VibePeep"
            />
          </div>
        </div>
      </div>
      <button type="button" className="vp-buddy-min" aria-label="Minimise VibePeep" onClick={() => save(true)}>
        <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true" focusable="false">
          <path d="M6 6l10 10M16 6L6 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
