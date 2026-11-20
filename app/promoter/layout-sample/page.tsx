import type { Metadata } from 'next'
import { LayoutSample } from './sample'

export const metadata: Metadata = {
  title: 'Layout sample',
  robots: { index: false, follow: false },
}

/** Visual fixture for the package and boost cards. Nothing on this page can be bought. */
export default function LayoutSamplePage() {
  return (
    <main className="vp-wrap space-y-16 bg-background px-4 py-8 text-foreground sm:px-6">
      <p className="text-sm text-muted-foreground">Layout sample. These cards use stand-in copy. Nothing here is for sale.</p>
      <LayoutSample />
    </main>
  )
}
