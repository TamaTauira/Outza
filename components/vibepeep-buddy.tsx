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
  const [minimised, setMinimised] = useState(() => readMinimised())
  const rootRef = useRef<HTMLDivElement>(null)

  const save = (next: boolean) => {
    setMinimised(next)
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch { /* private mode */ }
  }

  useEffect(() => {
    const root = rootRef.current
    if (!root || minimised) return
    return attachRoam(root)
  }, [minimised, onMap])

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
          <button type="button" className="vp-buddy-min" aria-label="Minimise VibePeep" onClick={() => save(true)}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
    </div>
  )
}
