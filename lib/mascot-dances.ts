/**
 * Twenty click-party routines. Ids are internal.
 * Visible copy never names a real person or uses their likeness.
 * No audio. The moves are evoked with his own limbs and simple props.
 */
export const DANCE_IDS = [
  'moonwalk',
  'robot',
  'ymca',
  'macarena',
  'snake',
  'island',
  'griddy',
  'goth-snap',
  'hand-jive',
  'shuffle',
  'floss',
  'sprinkler',
  'running-man',
  'twist',
  'worm',
  'chicken',
  'disco-point',
  'shopping-cart',
  'horse',
  'cha-cha',
] as const

export type DanceId = (typeof DANCE_IDS)[number]

/** Bubble copy for each routine. Ids stay internal. Never name a real person or a trademarked routine. */
export const DANCE_LABELS: Record<DanceId, string> = {
  moonwalk: 'Smooth little glide.',
  robot: 'Stiff little robot.',
  ymca: 'Arms up, spelling it out.',
  macarena: 'Hands, hips, spin.',
  snake: 'Sssmooth move.',
  island: 'Easy island sway.',
  griddy: 'Quick feet, big grin.',
  'goth-snap': 'Slow snap.',
  'hand-jive': 'Hand jive.',
  shuffle: 'Shuffle time.',
  floss: 'Arms through.',
  sprinkler: 'Sprinkler arms.',
  'running-man': 'Running on the spot.',
  twist: 'Give it a twist.',
  worm: 'Down for the worm.',
  chicken: 'Chicken wings.',
  'disco-point': 'Disco point.',
  'shopping-cart': 'Trolley roll.',
  horse: 'Little gallop.',
  'cha-cha': 'Cha-cha steps.',
}

export const DANCE_MS = 4400

/** Next party routine. Never the one that just played. */
export function pickDance(last: DanceId | null, rand: () => number = Math.random): DanceId {
  const pool = last ? DANCE_IDS.filter((id) => id !== last) : DANCE_IDS
  const index = Math.min(pool.length - 1, Math.floor(rand() * pool.length))
  return pool[index]!
}
