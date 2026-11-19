import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign in · VibePeep',
  description: 'Sign in to save events, keep an itinerary and manage a promoter or venue account.',
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
