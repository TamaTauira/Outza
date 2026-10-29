'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const Buddy = dynamic(() => import('@/components/vibepeep-buddy').then((mod) => mod.VibePeepBuddy), { ssr: false })

/** Mounts the corner buddy after idle so it never competes with first paint. */
export function VibePeepBuddySlot() {
  const [on, setOn] = useState(false)

  useEffect(() => {
    const arm = () => setOn(true)
    const idle = window.requestIdleCallback?.(arm, { timeout: 2200 })
    const timer = idle ? 0 : window.setTimeout(arm, 1200)
    return () => {
      if (idle) window.cancelIdleCallback?.(idle)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  if (!on) return null
  return <Buddy />
}
