import { PageScrollLock } from '@/components/page-scroll-lock'

/** The list stays mounted underneath. This holds it still until the peek closes. */
export default function EventPeekLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageScrollLock />
      {children}
    </>
  )
}
