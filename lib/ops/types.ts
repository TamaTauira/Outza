/** Shared shapes for the auto-resolver. No database imports. */

export const RULE_KEYS = [
  'expired_hidden',
  'missing_coords',
  'time_conflict',
  'duplicate_flagged',
  'duplicate_review',
  'held_events',
  'event_reports',
  'claims',
  'venue_profile',
] as const

export type RuleKey = (typeof RULE_KEYS)[number]

export const DEFAULT_THRESHOLDS = {
  duplicateLink: 0.9,
  duplicateDismiss: 0.2,
  timeConflict: 0.75,
  heldApprove: 0.85,
} as const

export type Thresholds = { [K in keyof typeof DEFAULT_THRESHOLDS]: number }

export type Actor = 'bot:rules' | 'bot:ai' | 'owner-digest' | `admin:${string}`

export const UNDO_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
export const DIGEST_TOKEN_MS = 14 * 24 * 60 * 60 * 1000

export type Act = {
  outcome: 'act'
  action: string
  reason: string
  confidence: number
  actor: 'bot:rules' | 'bot:ai'
  highRisk?: boolean
  /** Extra fields the applier copies onto the effect, such as coordinates. */
  patch?: Record<string, unknown>
}

export type Digest = {
  outcome: 'digest'
  reason: string
  confidence: number
  summary: string
  approveAction: string
  declineAction: string
}

export type Skip = { outcome: 'skip'; reason: string }

export type Ruling = Act | Digest | Skip

export type Snapshot = {
  qualityAudit?: { id: string; status: string | null; reviewedAt: string | null }
  event?: {
    id: string
    duplicateOfId: string | null
    latitude: number | null
    longitude: number | null
    hidden: boolean
    moderationStatus: string | null
    status: string
    date: string
    promoterId: string | null
  }
  eventReport?: { id: string; status: string; resolvedAt: string | null }
  eventClaim?: { id: string; status: string; reviewNote: string | null; reviewedAt: string | null }
  claimUser?: { id: string; role: string }
  venueClaim?: { id: string; status: string; reviewedAt: string | null; riskNote: string | null }
  venue?: { id: string; claimStatus?: string; fields?: Record<string, string | null> }
  venueChange?: { id: string; status: string; reviewedAt: string | null }
  grantId?: string | null
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export function thresholdsFrom(value: unknown): Thresholds {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const num = (key: keyof Thresholds, fallback: number) => {
    const n = Number(raw[key])
    return Number.isFinite(n) ? clamp01(n) : fallback
  }
  return {
    duplicateLink: num('duplicateLink', DEFAULT_THRESHOLDS.duplicateLink),
    duplicateDismiss: num('duplicateDismiss', DEFAULT_THRESHOLDS.duplicateDismiss),
    timeConflict: num('timeConflict', DEFAULT_THRESHOLDS.timeConflict),
    heldApprove: num('heldApprove', DEFAULT_THRESHOLDS.heldApprove),
  }
}
