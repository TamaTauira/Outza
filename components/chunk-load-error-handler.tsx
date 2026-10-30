'use client'

// Reloads once when a JavaScript chunk or dynamic import fails to load
// (a deploy switch, or a one-off mobile fetch). Do not remove this: it covers
// window "error" and unhandledrejection, which do not always reach an error
// boundary. app/error.tsx and app/global-error.tsx report through reportCrash,
// which uses the same one-reload guard.

import { useEffect } from 'react'
import { isChunkLoadError } from '@/lib/chunk-load'
import { reportCrash } from '@/components/report-crash'

function asReportable(value: unknown): Error & { digest?: string } {
  if (value instanceof Error) return value
  if (typeof value === 'string' && value.trim()) return new Error(value)
  return new Error('Failed to load chunk')
}

function recover(value: unknown) {
  reportCrash(asReportable(value))
}

export function ChunkLoadErrorHandler() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const value = isChunkLoadError(event.error) ? event.error : event.message
      if (!isChunkLoadError(value)) return
      event.preventDefault()
      recover(value)
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkLoadError(event.reason)) return
      event.preventDefault()
      recover(event.reason)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
