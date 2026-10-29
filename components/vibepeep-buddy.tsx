'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { BRAND_MASCOT_SRC, BRAND_MASCOT_WEBP } from '@/lib/brand'
import { VibePeepMascot } from '@/components/vibepeep-mascot'

const KEY = 'vibepeep-buddy-minimised'

function readMinimised() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Small corner mascot on pages that don't already feature him in the hero. */
export function VibePeepBuddy() {
  const path = usePathname()
  const [minimised, setMinimised] = useState(() => readMinimised())
  if (path === '/') return null

  const onMap = path === '/map'
  const save = (next: boolean) => {
    setMinimised(next)
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch { /* private mode */ }
  }

  return (
    <div className={`vp-buddy pointer-events-none ${onMap ? 'vp-buddy-map' : ''}`}>
      {minimised ? (
        <button
          type="button"
          className="vp-buddy-mini"
          aria-label="Show VibePeep"
          aria-expanded={false}
          onClick={() => save(false)}
        >
          <span className="vp-bob">
            <picture>
              <source srcSet={BRAND_MASCOT_WEBP} type="image/webp" />
              <img src={BRAND_MASCOT_SRC} alt="" width={48} height={48} draggable={false} />
            </picture>
          </span>
        </button>
      ) : (
        <div className="pointer-events-auto relative">
          <VibePeepMascot
            className={onMap ? 'w-12' : 'w-14 sm:w-16'}
            bubble="start"
            alt="VibePeep"
          />
          <button type="button" className="vp-buddy-min" aria-label="Minimise VibePeep" onClick={() => save(true)}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
    </div>
  )
}
