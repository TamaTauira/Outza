/** Click reactions for the VibePeep mascot. Party mode is a separate combo, not in this pool. */
export const REACTION_IDS = [
  'hearts',
  'spin',
  'wiggle',
  'wink',
  'giggle',
  'sleepy',
  'confetti',
  'peekaboo',
  'heart-eyes',
  'squash',
  'blush',
  'highfive',
  'eyepop',
  'rainbow',
] as const

export type ReactionId = (typeof REACTION_IDS)[number]

export const REACTION_LINES: Record<ReactionId, string> = {
  hearts: 'Caught a crush on tonight.',
  spin: 'Full spin. Still facing the fun.',
  wiggle: 'This is my going-out dance.',
  wink: 'Take a peep!',
  giggle: 'Psst… something’s on tonight 👀',
  sleepy: 'I dozed off. What’s on?',
  confetti: 'That’s a yes from me.',
  peekaboo: 'Peekaboo. Found your night.',
  'heart-eyes': 'Already in love with this one.',
  squash: 'Boing. Let’s get out there.',
  blush: 'Stop it. You’ll make me blush.',
  highfive: 'Up top. You showed up.',
  eyepop: 'Wait. That one’s tonight?',
  rainbow: 'Full-spectrum kind of night.',
}

export const REACTION_MS: Record<ReactionId, number> = {
  hearts: 2300,
  spin: 2100,
  wiggle: 2200,
  wink: 1900,
  giggle: 2300,
  sleepy: 3200,
  confetti: 2200,
  peekaboo: 2400,
  'heart-eyes': 2300,
  squash: 1900,
  blush: 2200,
  highfive: 1800,
  eyepop: 1700,
  rainbow: 2400,
}

export const PARTY_LINE = 'Super party mode. Everyone’s invited.'
export const PARTY_MS = 3600

export const HOVER_POOL: ReactionId[] = ['wink', 'giggle', 'hearts']

export const HOVER_LINES = [
  'Still looking? Good. So am I.',
  'I can wait. The night won’t.',
  'Take a peep!',
]

/** Next reaction, never the one that just played. `rand` returns a number in [0, 1). */
export function pickReaction(last: ReactionId | null, rand: () => number = Math.random): ReactionId {
  const pool = last ? REACTION_IDS.filter((id) => id !== last) : REACTION_IDS
  const index = Math.min(pool.length - 1, Math.floor(rand() * pool.length))
  return pool[index]
}

/** True when the newest stamps contain 5 clicks inside the window. Stamps must be ascending. */
export function isPartyCombo(stamps: number[], now: number, windowMs = 1700): boolean {
  let count = 0
  for (let i = stamps.length - 1; i >= 0; i--) {
    if (now - stamps[i] > windowMs) break
    count++
  }
  return count >= 5
}
