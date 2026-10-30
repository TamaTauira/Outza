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

export const DANCE_MS = 4400

/** Next party routine. Never the one that just played. */
export function pickDance(last: DanceId | null, rand: () => number = Math.random): DanceId {
  const pool = last ? DANCE_IDS.filter((id) => id !== last) : DANCE_IDS
  const index = Math.min(pool.length - 1, Math.floor(rand() * pool.length))
  return pool[index]!
}
