import { HomeClient } from '@/components/home-client'

// Board (/), Map (/map) and Saved (/saved) share this layout so the board state survives switching views.
export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <HomeClient />
    </>
  )
}
