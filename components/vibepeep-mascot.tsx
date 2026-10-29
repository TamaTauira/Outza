'use client'

import { useEffect, useRef } from 'react'
import { BRAND_MASCOT_HEIGHT, BRAND_MASCOT_SRC, BRAND_MASCOT_WEBP, BRAND_MASCOT_WIDTH } from '@/lib/brand'

export type MascotBubble = 'center' | 'start'

function mascotLabel(alt?: string) {
  const name = alt?.trim() ? alt.trim() : 'VibePeep'
  return `${name}. Press for a surprise.`
}

function MascotArt({ priority, onDark }: { priority: boolean; onDark: boolean }) {
  const rim = onDark
    ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.42)]'
    : 'dark:drop-shadow-[0_0_12px_rgba(255,255,255,0.42)]'
  return (
    <picture className="block w-full">
      <source srcSet={BRAND_MASCOT_WEBP} type="image/webp" />
      <img
        src={BRAND_MASCOT_SRC}
        alt=""
        width={BRAND_MASCOT_WIDTH}
        height={BRAND_MASCOT_HEIGHT}
        draggable={false}
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        className={`pointer-events-none h-auto w-full select-none ${rim}`}
      />
    </picture>
  )
}

/**
 * The existing mascot bitmap, with idle life and click reactions.
 * The image is in the first paint. Behaviour loads on idle so it stays off the LCP path.
 */
export function VibePeepMascot({
  className = 'w-32',
  alt = 'VibePeep, a round black robot with orange and pink eyes, mid-jump and waving',
  priority = false,
  /** The hero is dark in both themes, so the silhouette needs a rim there too. */
  onDark = false,
  bubble = 'center',
}: {
  className?: string
  alt?: string
  priority?: boolean
  onDark?: boolean
  bubble?: MascotBubble
}) {
  const slotRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const slot = slotRef.current
    const button = slot?.querySelector<HTMLButtonElement>('.vp-hit')
    if (!slot || !button) return
    let dead = false
    let started = false
    let detach = () => {}

    const queueClick = () => {
      const next = Number(button.getAttribute('data-queued') || '0') + 1
      button.setAttribute('data-queued', String(next))
    }

    const start = () => {
      if (started) return
      started = true
      void import('./vibepeep-mascot-engine').then((mod) => {
        if (dead) return
        button.removeEventListener('click', queueClick)
        detach = mod.attachMascot(slot)
      })
    }

    button.addEventListener('click', queueClick)
    button.addEventListener('pointerdown', start, { once: true })
    button.addEventListener('focus', start, { once: true })

    const idle = window.requestIdleCallback?.(start, { timeout: 1600 })
    const timer = idle ? 0 : window.setTimeout(start, 700)

    return () => {
      dead = true
      button.removeEventListener('click', queueClick)
      button.removeEventListener('pointerdown', start)
      button.removeEventListener('focus', start)
      if (idle) window.cancelIdleCallback?.(idle)
      if (timer) window.clearTimeout(timer)
      detach()
    }
  }, [])

  return (
    <span ref={slotRef} className={`vp-slot inline-block align-middle ${className}`} data-bubble={bubble}>
      <button type="button" className="vp-hit" aria-label={mascotLabel(alt)}>
        <span className="vp-stage">
          <span className="vp-bob">
            <span className="vp-look">
              <span className="vp-act">
                <MascotArt priority={priority} onDark={onDark} />
                <span className="vp-lid vp-lid-l" aria-hidden="true" />
                <span className="vp-lid vp-lid-r" aria-hidden="true" />
                <span className="vp-blush vp-blush-l" aria-hidden="true" />
                <span className="vp-blush vp-blush-r" aria-hidden="true" />
                <span className="vp-heart vp-heart-l" aria-hidden="true">♥</span>
                <span className="vp-heart vp-heart-r" aria-hidden="true">♥</span>
                <span className="vp-pop vp-pop-l" aria-hidden="true"><i /></span>
                <span className="vp-pop vp-pop-r" aria-hidden="true"><i /></span>
                <span className="vp-zzz" aria-hidden="true"><span>z</span><span>z</span><span>Z</span></span>
                <span className="vp-five" aria-hidden="true">✋</span>
              </span>
            </span>
          </span>
          <span className="vp-fx" aria-hidden="true" />
        </span>
        <span className="vp-bubble" aria-hidden="true" />
      </button>
      <span className="vp-live sr-only" aria-live="polite" />
    </span>
  )
}
