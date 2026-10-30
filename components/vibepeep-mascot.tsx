'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { BRAND_MASCOT_HEIGHT, BRAND_MASCOT_SRC, BRAND_MASCOT_WIDTH } from '@/lib/brand'
import rig from '@/lib/mascot-rig.json'

export type MascotBubble = 'center' | 'start'

function mascotLabel(alt?: string) {
  const name = alt?.trim() ? alt.trim() : 'VibePeep'
  return `${name}. Press for a surprise.`
}

const PART_CLASS: Record<string, string> = {
  body: 'vp-torso',
  'arm-l': 'vp-arm vp-arm-l',
  'arm-r': 'vp-arm vp-arm-r',
  'leg-l': 'vp-leg vp-leg-l',
  'leg-r': 'vp-leg vp-leg-r',
  antenna: 'vp-ant',
  'pupil-l': 'vp-pupil vp-pupil-l',
  'pupil-r': 'vp-pupil vp-pupil-r',
  'spark-0': 'vp-spark vp-spark-0',
  'spark-1': 'vp-spark vp-spark-1',
  'spark-2': 'vp-spark vp-spark-2',
  'spark-3': 'vp-spark vp-spark-3',
}

type RigBox = { left: number; top: number; width: number; height: number; originX: number; originY: number }

/** Segmented cut of vibepeep-mascot.png. At rest the parts stack back into that picture. */
function MascotRig() {
  const layout = rig.layout as Record<string, RigBox>
  return (
    <span className="vp-rig">
      {rig.order.map((name) => {
        const box = layout[name]
        if (!box) return null
        return (
          <span
            key={name}
            className={`vp-part ${PART_CLASS[name] ?? ''}`}
            style={{
              left: `${box.left * 100}%`,
              top: `${box.top * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
              transformOrigin: `${box.originX * 100}% ${box.originY * 100}%`,
            }}
          >
            <Image src={`/mascot/${name}.png`} alt="" fill unoptimized sizes="160px" draggable={false} className="object-fill" />
          </span>
        )
      })}
    </span>
  )
}

function MascotArt({ priority, onDark, sizes }: { priority: boolean; onDark: boolean; sizes: string }) {
  const rim = onDark
    ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.42)]'
    : 'dark:drop-shadow-[0_0_12px_rgba(255,255,255,0.42)]'
  return (
    <Image
      src={BRAND_MASCOT_SRC}
      alt=""
      width={BRAND_MASCOT_WIDTH}
      height={BRAND_MASCOT_HEIGHT}
      sizes={sizes}
      priority={priority}
      draggable={false}
      className={`pointer-events-none h-auto w-full select-none ${rim}`}
    />
  )
}

/**
 * The existing mascot bitmap, with idle life and click reactions.
 * The image is in the first paint. Behaviour loads on idle so it stays off the LCP path.
 * `sizes` tells the image optimiser the displayed width. The source file is 1104px.
 */
export function VibePeepMascot({
  className = 'w-32',
  alt = 'VibePeep, a round black robot with orange and pink eyes, mid-jump and waving',
  priority = false,
  /** The hero is dark in both themes, so the silhouette needs a rim there too. */
  onDark = false,
  bubble = 'center',
  sizes = '(max-width: 640px) 112px, 192px',
  /** Stacked limb rig for the roaming buddy. Other spots keep the single bitmap. */
  rig: living = false,
}: {
  className?: string
  alt?: string
  priority?: boolean
  onDark?: boolean
  bubble?: MascotBubble
  sizes?: string
  rig?: boolean
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
              <span className="vp-face">
                <span className="vp-act">
                  {living ? <MascotRig /> : <MascotArt priority={priority} onDark={onDark} sizes={sizes} />}
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
                  <span className="vp-paw" aria-hidden="true">🐾</span>
                  <span className="vp-note vp-note-a" aria-hidden="true">♪</span>
                  <span className="vp-note vp-note-b" aria-hidden="true">♫</span>
                  <span className="vp-star vp-star-l" aria-hidden="true">✦</span>
                  <span className="vp-star vp-star-r" aria-hidden="true">✧</span>
                  <span className="vp-star vp-star-c" aria-hidden="true">✦</span>
                </span>
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
