'use client'

// Reloads once when a JavaScript chunk or dynamic import fails to load
// (a deploy switch, or a one-off mobile fetch). Do not remove this: it covers
// window "error" and unhandledrejection, which do not always reach an error
// boundary. app/error.tsx and app/global-error.tsx report through reportCrash,
// which uses the same one-reload guard.

import { useEffect } from 'react'
import { isChunkLoadError } from '@/lib/chunk-load'
import { isBareNetworkFault } from '@/lib/network-fault'
import { reportCrash } from '@/components/report-crash'

function asReportable(value: unknown): Error & { digest?: string } {
  if (value instanceof Error) return value
  if (typeof value === 'string' && value.trim()) return new Error(value)
  return new Error('Failed to load chunk')
}

function networkReport(value: unknown): Error {
  if (value instanceof Error && value.stack) return value
  const message = value instanceof Error ? (value.message || 'Load failed') : typeof value === 'string' && value.trim() ? value : 'Load failed'
  const error = new Error(message)
  error.name = value instanceof Error && value.name ? value.name : 'TypeError'
  error.stack = ''
  return error
}

function recover(value: unknown) {
  reportCrash(asReportable(value))
}

export function ChunkLoadErrorHandler() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const value = event.error ?? event.message
      if (isChunkLoadError(value)) {
        event.preventDefault()
        recover(value)
        return
      }
      // A fetch that rejects with no stack must not surface as a page crash.
      if (!isBareNetworkFault(value)) return
      event.preventDefault()
      reportCrash(networkReport(value))
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) {
        event.preventDefault()
        recover(event.reason)
        return
      }
      if (!isBareNetworkFault(event.reason)) return
      event.preventDefault()
      reportCrash(networkReport(event.reason))
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
