'use client'

import { useEffect, useState } from 'react'

/** True once a signed-in person has at least one Local listing. */
export function useHasLocalListings(enabled: boolean) {
  const [has, setHas] = useState(false)
  useEffect(() => {
    if (!enabled) {
      setHas(false)
      return
    }
    let live = true
    fetch('/api/local?mine=1')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!live || !body) return
        setHas((body.listings?.length ?? 0) + (body.community?.length ?? 0) > 0)
      })
      .catch(() => {})
    return () => { live = false }
  }, [enabled])
  return has
}
