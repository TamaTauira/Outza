import { PageScrollLock } from '@/components/page-scroll-lock'

/** The Local list stays mounted underneath. This holds it still until the peek closes. */
export default function LocalPeekLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageScrollLock />
      {children}
    </>
  )
}
