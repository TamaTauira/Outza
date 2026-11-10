'use client'

import { useEffect } from 'react'

/** Counts a listing appearance once per browser session, per surface. No third-party tracker. */
export function ReachBeacon({ surface, ids, term, spotlightIds = [] }: { surface: string; ids: string[]; term?: string; spotlightIds?: string[] }) {
  const key = `${surface}|${ids.slice(0, 12).join(',')}|${term ?? ''}|${spotlightIds.slice(0, 12).join(',')}`
  useEffect(() => {
    const fresh: string[] = []
    const spotlight: string[] = []
    const take = (list: string[], into: string[]) => {
      for (const id of list.slice(0, 12)) {
        const mark = `vp-reach:${surface}:${id}`
        try {
          if (sessionStorage.getItem(mark)) continue
          sessionStorage.setItem(mark, '1')
        } catch { /* private mode still counts this view */ }
        into.push(id)
      }
    }
    take(ids, fresh)
    take(spotlightIds, spotlight)
    if (!fresh.length && !spotlight.length) return
    fetch('/api/reach', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ surface, ids: fresh, term: term || undefined, spotlightIds: spotlight }),
      keepalive: true,
    }).catch(() => {})
    // key already folds surface, ids and term, so a new view is a new effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}
