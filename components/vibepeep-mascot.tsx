'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { VibePeepFigure } from '@/components/vibepeep-figure'
import { BRAND_MASCOT_HEIGHT, BRAND_MASCOT_SRC, BRAND_MASCOT_WIDTH } from '@/lib/brand'

export type MascotBubble = 'center' | 'start'

function mascotLabel(alt?: string) {
  const name = alt?.trim() ? alt.trim() : 'VibePeep'
  return `${name}. Press for a surprise.`
}

/** Jointed figure. Front for tricks, three-quarter when he walks. */
function MascotRig() {
  return (
    <span className="vp-rig">
      <VibePeepFigure />
      <span className="vp-prop vp-pizza" aria-hidden="true"><Pizza /></span>
      <span className="vp-prop vp-mic" aria-hidden="true"><Mic /></span>
      <span className="vp-prop vp-kick" aria-hidden="true"><Ball /></span>
      <span className="vp-prop vp-brush" aria-hidden="true"><Brush /></span>
      <span className="vp-prop vp-dab" aria-hidden="true"><Dab /></span>
      <span className="vp-prop vp-snake" aria-hidden="true"><Snake /></span>
      <span className="vp-prop vp-flower" aria-hidden="true"><Flower /></span>
    </span>
  )
}

function Pizza() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M6 20c16-10 36-10 52 0L34 56 6 20z" fill="#E39A3C" />
      <path d="M12 22c12-6 28-6 40 0L34 50 12 22z" fill="#F6D56A" />
      <circle cx="24" cy="28" r="4" fill="#D64532" />
      <circle cx="36" cy="32" r="3.4" fill="#C53428" />
      <circle cx="30" cy="24" r="2.6" fill="#A82C22" />
    </svg>
  )
}

function Mic() {
  return (
    <svg viewBox="0 0 32 48" aria-hidden="true">
      <rect x="9" y="2" width="14" height="22" rx="7" fill="#E6EBF2" />
      <rect x="12" y="5" width="8" height="14" rx="4" fill="#8B95A6" />
      <path d="M7 16v6a9 9 0 0 0 18 0v-6" fill="none" stroke="#1c1c1e" strokeWidth="2.4" />
      <path d="M16 31v8" stroke="#1c1c1e" strokeWidth="3" />
      <rect x="9" y="38" width="14" height="4" rx="1.5" fill="#111" />
    </svg>
  )
}

function Ball() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="20" fill="#f7f7f5" />
      <path d="M24 6l6 10H18zM8 20l8 4-2 10-10-4zM40 20l-8 4 2 10 10-4zM16 36l8 6 8-6-4-6h-8z" fill="#1a1a1a" />
    </svg>
  )
}

function Brush() {
  return (
    <svg viewBox="0 0 28 64" aria-hidden="true">
      <rect x="11" y="16" width="6" height="34" rx="2" fill="#3a2418" />
      <rect x="8" y="46" width="12" height="6" rx="1" fill="#C9A06A" />
      <path d="M6 8h16l-2 12H8z" fill="#FF8A1A" />
      <path d="M8 4h12l-1 6H9z" fill="#FF4E6A" />
    </svg>
  )
}

function Dab() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 30c8-16 20-16 28-2" fill="none" stroke="#FF8A1A" strokeWidth="5" strokeLinecap="round" />
      <path d="M14 36c6-8 12-8 18 0" fill="none" stroke="#FF4E6A" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

function Snake() {
  return (
    <svg viewBox="0 0 120 48" aria-hidden="true">
      <path d="M8 30c14-18 24-8 32-8s14 14 24 10 18-16 28-8 12 14 20 6" fill="none" stroke="#2a2a2e" strokeWidth="12" strokeLinecap="round" />
      <path d="M8 30c14-18 24-8 32-8s14 14 24 10 18-16 28-8 12 14 20 6" fill="none" stroke="#FF8A1A" strokeWidth="4" strokeLinecap="round" />
      <circle cx="104" cy="20" r="7" fill="#2a2a2e" />
      <circle cx="106" cy="18" r="1.6" fill="#fff" />
      <circle cx="100" cy="18" r="1.6" fill="#fff" />
      <path d="M112 22c4 2 6 2 8 0" fill="none" stroke="#FF4E6A" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function Flower() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="14" r="7" fill="#FF8A1A" />
      <circle cx="34" cy="22" r="7" fill="#FF4E6A" />
      <circle cx="30" cy="34" r="7" fill="#FF8A1A" />
      <circle cx="16" cy="34" r="7" fill="#FF4E6A" />
      <circle cx="12" cy="22" r="7" fill="#FF8A1A" />
      <circle cx="24" cy="24" r="5" fill="#F6D56A" />
    </svg>
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
          <span className="vp-show" aria-hidden="true">
            <i className="vp-disco-ball vp-ball-a" />
            <i className="vp-disco-ball vp-ball-b" />
            <i className="vp-disco-ball vp-ball-c" />
            <i className="vp-sweep" />
            <i className="vp-glint vp-glint-a" />
            <i className="vp-glint vp-glint-b" />
            <i className="vp-glint vp-glint-c" />
          </span>
        </span>
        <span className="vp-bubble" aria-hidden="true" />
      </button>
      <span className="vp-live sr-only" aria-live="polite" />
    </span>
  )
}
