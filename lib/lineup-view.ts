/** Homepage line-up. List is the default. A stored map choice does not reopen the map inside this toggle. */
export type LineupView = 'list' | 'board'

export function lineupView(stored: string | null | undefined): LineupView {
  return stored === 'board' ? 'board' : 'list'
}
