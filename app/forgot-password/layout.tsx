import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reset your password · VibePeep',
  description: 'Ask for a link to choose a new VibePeep password.',
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
