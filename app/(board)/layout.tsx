import { HomeClient } from '@/components/home-client'
import type { BoardSeed } from '@/components/event-list'
import type { BoardEvent } from '@/components/board-row'
import { sydneyNow } from '@/lib/board'
import { DEFAULT_CITY } from '@/lib/cities'
import { getBoardFeed } from '@/lib/board-feed'

export const revalidate = 60

// Board (/), Map (/map) and Saved (/saved) share this layout so the board state survives switching views.
export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const now = sydneyNow()
  let initialBoard: BoardSeed | null = null
  try {
    const feed = await getBoardFeed({
      page: 1,
      limit: 300,
      search: '',
      categories: [],
      subTag: '',
      suburb: '',
      isFree: false,
      isLGBTI: false,
      dateFrom: now.date,
      dateTo: now.date,
      sortBy: 'date',
      city: DEFAULT_CITY,
      promoterId: '',
    })
    initialBoard = {
      city: DEFAULT_CITY,
      from: now.date,
      to: now.date,
      events: feed.events as unknown as BoardEvent[],
      total: feed.total,
      totalPages: Math.max(1, Math.ceil(feed.total / 300)),
    }
  } catch (err) {
    console.error('Board seed failed:', err instanceof Error ? err.message : err)
  }
  return (
    <>
      {children}
      <HomeClient initialNow={now} initialBoard={initialBoard} />
    </>
  )
}
