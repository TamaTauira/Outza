import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Confirm your email · VibePeep',
  robots: { index: false, follow: false },
}

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children
}
