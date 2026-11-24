import { prisma } from '@/lib/db'
import { ensureOpsTables } from '@/lib/ops/ensure'
import { loadRuleConfig } from '@/lib/ops/decide'
import { RULE_KEYS, type Thresholds } from '@/lib/ops/types'
import { undoAllowed } from '@/lib/ops/undo'

export const RULE_LABELS: Record<(typeof RULE_KEYS)[number], string> = {
  expired_hidden: 'Close expired listings',
  missing_coords: 'Place missing pins',
  time_conflict: 'Settle time conflicts',
  duplicate_flagged: 'Keep owner-protected duplicates',
  duplicate_review: 'Judge possible duplicates',
  held_events: 'Review held listings',
  event_reports: 'Check listing reports',
  claims: 'Decide organiser claims',
  venue_profile: 'Apply safe venue edits',
}

export type OpsDecisionRow = {
  id: string
  kind: string
  action: string
  reason: string
  confidence: number
  actor: string
  targetType: string
  targetId: string
  createdAt: string
  undoneAt: string | null
  undoable: boolean
}

export type OpsPageData = {
  openDigest: number
  handledWeek: number
  undone: number
  byKind: { kind: string; count: number }[]
  decisions: OpsDecisionRow[]
  rules: { key: string; label: string; enabled: boolean }[]
  thresholds: Thresholds
}

export async function loadOpsPage(now = new Date()): Promise<OpsPageData> {
  await ensureOpsTables()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const [openDigest, handledWeek, undone, grouped, decisions, config] = await Promise.all([
    prisma.opsDigestItem.count({ where: { status: 'OPEN' } }),
    prisma.opsDecision.count({ where: { createdAt: { gte: weekAgo }, undoneAt: null, actor: { in: ['bot:rules', 'bot:ai'] }, action: { notIn: ['digest', 'geocode-failed', 'safety-email'] } } }),
    prisma.opsDecision.count({ where: { undoneAt: { not: null } } }),
    prisma.opsDecision.groupBy({ by: ['kind'], _count: { _all: true }, where: { undoneAt: null, action: { not: 'undo' } } }),
    prisma.opsDecision.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    loadRuleConfig(),
  ])
  return {
    openDigest,
    handledWeek,
    undone,
    byKind: grouped.map((row) => ({ kind: row.kind, count: row._count._all })).sort((a, b) => b.count - a.count),
    decisions: decisions.map((row) => ({
      id: row.id,
      kind: row.kind,
      action: row.action,
      reason: row.reason,
      confidence: row.confidence,
      actor: row.actor,
      targetType: row.targetType,
      targetId: row.targetId,
      createdAt: row.createdAt.toISOString(),
      undoneAt: row.undoneAt?.toISOString() ?? null,
      undoable: row.action !== 'undo' && undoAllowed(row.createdAt, row.undoneAt, now).ok,
    })),
    rules: RULE_KEYS.map((key) => ({ key, label: RULE_LABELS[key], enabled: config.enabled[key] })),
    thresholds: config.thresholds,
  }
}
