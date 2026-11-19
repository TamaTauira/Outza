'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'

/** One theme-color that follows the theme actually on screen. */
export function ThemeColor() {
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) return
    meta.setAttribute('content', resolvedTheme === 'light' ? '#f6f4ee' : '#0c0f0e')
  }, [resolvedTheme])
  return null
}
