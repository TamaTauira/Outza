'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { readCity, readUserCity, resolveBoardCity, searchInheritTarget, writeCity, writeUserCity } from '@/lib/city-pref'
import { readJson } from '@/lib/client-fetch'
import { hintsToQuery, type SearchHints } from '@/lib/search-hints'

/**
 * /search is server-rendered from its URL, so a link that named no city is
 * seeded with the default city before the visitor's own city is knowable.
 * This corrects the URL to the city the board itself would open on — the
 * same resolveBoardCity precedence HomeClient runs (the person's own pick,
 * then the device pick, then their account home city, then the edge IP
 * default) — and the server re-renders under it, so the heading, the count
 * line and the results all name the city actually searched. It renders
 * nothing, and the page mounts it only when the URL named no city; a city
 * named in the words themselves is left alone (the searched city follows
 * the query).
 */
export function SearchCityInherit({
  seedCity,
  queryCity,
  query,
  hints,
}: {
  seedCity: string
  queryCity: string
  query: string
  hints: SearchHints
}) {
  const router = useRouter()
  const { data: session, status: authStatus } = useSession()
  const userId = authStatus === 'authenticated' ? session?.user?.id ?? null : null
  const ran = useRef(false)

  useEffect(() => {
    if (authStatus === 'loading' || ran.current) return
    ran.current = true
    if (queryCity) return
    let cancelled = false
    const signedIn = !!userId
    const userCity = signedIn ? readUserCity(userId) : null
    const guestCity = readCity()
    const correct = (city: string) => {
      const target = searchInheritTarget({ seedCity, queryCity, resolvedCity: city })
      if (target) router.replace(`/search?${hintsToQuery(hints, { q: query, city: target }).toString()}`)
    }
    const apply = (homeCity: string | null, persist = true) => {
      if (cancelled) return
      const next = resolveBoardCity({ urlCity: null, userCity, homeCity, guestCity, signedIn })
      // Write the result back only to the store this resolution belongs
      // to, exactly as the board does, so a fallback never cements itself
      // over a pick it did not read.
      if (persist) {
        if (signedIn) writeUserCity(userId, next)
        else writeCity(next)
      }
      correct(next)
    }
    // A stored pick settles the search on its own. The edge (IP) default
    // only ever fills gaps, as on the board: a guest with nothing stored
    // is consulted about it after the stored inputs resolve to the seed.
    if (!signedIn || userCity !== null || guestCity !== null) {
      apply(null)
      if (!signedIn && guestCity === null) {
        fetch('/api/edge-city').then((r) => r.json()).then((d) => {
          if (cancelled || typeof d?.city !== 'string' || !d.city) return
          writeCity(d.city)
          correct(d.city)
        }).catch(() => {})
      }
      return () => { cancelled = true }
    }
    // Signed in with nothing stored anywhere: the account home city is
    // the one input that needs a fetch, then the edge default, then the
    // seed the server already rendered.
    readJson<{ user?: { homeCity?: unknown } }>('/api/me').then((result) => {
      if (cancelled) return
      if (!result.ok) {
        // A failed read settles this visit on the seed and persists
        // nothing: a fallback must never be cemented as the person's pick.
        apply(null, false)
        return
      }
      const home = result.data?.user?.homeCity
      if (typeof home === 'string') { apply(home); return }
      fetch('/api/edge-city').then((r) => r.json()).then((d) => {
        if (cancelled) return
        if (typeof d?.city === 'string' && d.city) apply(d.city)
        else apply(null)
      }).catch(() => { if (!cancelled) apply(null) })
    })
    return () => { cancelled = true }
  }, [authStatus, userId, queryCity, seedCity, query, hints, router])

  return null
}
