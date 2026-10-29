'use client'

import { Navbar } from '@/components/navbar'
import { useSaved } from '@/lib/saved'

/** Global header for server-rendered pages that are not inside PageShell. */
export function SiteHeader() {
  const { saved } = useSaved()
  return <Navbar savedCount={saved.length} />
}
