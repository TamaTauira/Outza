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
  moonwalk: 'Smooth little glide. Backwards.',
  robot: 'Stiff little robot. Beep.',
  ymca: 'Arms up, spelling it out.',
  macarena: 'Hands, hips, little spin.',
  snake: 'Sssmooth. Tongue out.',
  island: 'Easy island sway. Nice.',
  griddy: 'Quick feet, big grin.',
  'goth-snap': 'Slow snap. No smiling.',
  'hand-jive': 'Hand jive. Palms ready.',
  shuffle: 'Shuffle time. Knees up.',
  floss: 'Arms through. Invisible rope.',
  sprinkler: 'Sprinkler arms. Garden party.',
  'running-man': 'Running on the spot. Nowhere fast.',
  twist: 'Give it a twist. Floor’s yours.',
  worm: 'Down low. Up for the worm.',
  chicken: 'Bok bok, wings out.',
  'disco-point': 'Disco point. Strike it.',
  'shopping-cart': 'Trolley roll. Aisle five.',
  horse: 'Little gallop. Neigh optional.',
  'cha-cha': 'Cha-cha steps. One, two.',
}

export const DANCE_MS = 4400

/** Next party routine. Never the one that just played. */
export function pickDance(last: DanceId | null, rand: () => number = Math.random): DanceId {
  const pool = last ? DANCE_IDS.filter((id) => id !== last) : DANCE_IDS
  const index = Math.min(pool.length - 1, Math.floor(rand() * pool.length))
  return pool[index]!
}
