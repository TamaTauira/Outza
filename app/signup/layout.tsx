import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create an account · VibePeep',
  description: 'Make a VibePeep account to save events and keep a plan.',
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
