'use client'

import { useEffect } from 'react'
import { lockPageScroll } from '@/lib/page-scroll-lock'

/** Holds the page still for as long as this component is mounted. */
export function PageScrollLock() {
  useEffect(() => lockPageScroll(), [])
  return null
}
