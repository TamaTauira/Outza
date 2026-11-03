/** Reaction kinds. Going also writes Attendance so friends-going stays one list. */

export const REACTION_KINDS = ['HOT', 'LOVE', 'INTERESTED', 'EXCITED', 'GOING'] as const
export type ReactionKind = (typeof REACTION_KINDS)[number]

export const REACTION_LABEL: Record<ReactionKind, { emoji: string; label: string }> = {
  HOT: { emoji: '🔥', label: 'Hot' },
  LOVE: { emoji: '❤️', label: 'Love it' },
  INTERESTED: { emoji: '👀', label: 'Interested' },
  EXCITED: { emoji: '🎉', label: 'Excited' },
  GOING: { emoji: '🙌', label: 'Going' },
}

/** Writes allowed per signed-in person per hour, across add and change. */
export const REACTION_HOUR_CAP = 30

export function isReactionKind(value: unknown): value is ReactionKind {
  return typeof value === 'string' && (REACTION_KINDS as readonly string[]).includes(value)
}

export function reactionRateLimited(writesInLastHour: number): boolean {
  return writesInLastHour >= REACTION_HOUR_CAP
}

/** One row per person, event and kind. Turning a kind off removes that row only. */
export function reactionWrite(input: { active: boolean; turnOn: boolean }): 'add' | 'remove' | 'unchanged' {
  if (input.turnOn && input.active) return 'unchanged'
  if (!input.turnOn && !input.active) return 'unchanged'
  return input.turnOn ? 'add' : 'remove'
}
