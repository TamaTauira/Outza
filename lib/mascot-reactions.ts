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
  'sneeze',
  'dance',
  'wave',
  'sparkle',
  'tickle',
  'delighted',
] as const

export type ReactionId = (typeof REACTION_IDS)[number]

export const REACTION_LINES: Record<ReactionId, string> = {
  hearts: 'Caught a crush. Hearts everywhere.',
  spin: 'Spin… and stick the landing.',
  wiggle: 'Happy wiggle. Hearts out.',
  wink: 'Take a peep!',
  giggle: 'Hehe… something’s on tonight 👀',
  sleepy: 'I dozed off. What’s on?',
  confetti: 'That’s a yes from me.',
  peekaboo: 'Peekaboo. Found your night.',
  'heart-eyes': 'Love-struck. Can’t even hide it.',
  squash: 'Big squat. Bigger jump.',
  blush: 'Stop it. You’ll make me blush.',
  highfive: 'Up top. You showed up.',
  eyepop: 'Starry-eyed. That one’s tonight?',
  rainbow: 'Full-spectrum kind of night.',
  sneeze: 'Achoo! Didn’t see that coming.',
  dance: 'Little dance. Notes and all.',
  wave: 'G’day! Over here.',
  sparkle: 'Starry-eyed for this one.',
  tickle: 'Hehe, that tickles!',
  delighted: 'You came back. I’m chuffed.',
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
  sneeze: 1600,
  dance: 2400,
  wave: 1800,
  sparkle: 2000,
  tickle: 1500,
  delighted: 2200,
}

/** Not in the random pool: tickle is the repeat-click gag, delighted is the sulk payoff. */
const SCRIPTED = new Set<ReactionId>(['tickle', 'delighted'])

export const PARTY_LINE = 'Super party mode. Everyone’s invited.'
export const PARTY_MS = 4400

export const HOVER_POOL: ReactionId[] = ['wink', 'giggle', 'hearts']

export const HOVER_LINES = [
  'Still looking? Good. So am I.',
  'I can wait. The night won’t.',
  'Take a peep!',
]

/** Next reaction, never the one that just played. `rand` returns a number in [0, 1). */
export function pickReaction(last: ReactionId | null, rand: () => number = Math.random): ReactionId {
  const base = REACTION_IDS.filter((id) => !SCRIPTED.has(id))
  const pool = last ? base.filter((id) => id !== last) : base
  const index = Math.min(pool.length - 1, Math.floor(rand() * pool.length))
  return pool[index]
}

/**
 * True when the newest stamps contain 2 clicks inside the window.
 * The engine passes a short window so this is a quick double-click, not every repeat tap.
 * Stamps must be ascending.
 */
export function isPartyCombo(stamps: number[], now: number, windowMs = 1700): boolean {
  let count = 0
  for (let i = stamps.length - 1; i >= 0; i--) {
    if (now - stamps[i] > windowMs) break
    count++
  }
  return count >= 2
}
