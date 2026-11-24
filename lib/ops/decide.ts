import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { restoreSnapshot } from '@/lib/ops/apply'
import { ensureOpsTables } from '@/lib/ops/ensure'
import { RULE_KEYS, thresholdsFrom, type RuleKey, type Thresholds } from '@/lib/ops/types'
import { snapshotOf, undoAllowed } from '@/lib/ops/undo'

export type DecisionInput = {
  kind: string
  targetType: string
  targetId: string
  action: string
  reason: string
  confidence: number
  actor: string
  before?: Prisma.InputJsonValue | null
  after?: Prisma.InputJsonValue | null
}

export async function recentDecision(targetType: string, targetId: string, action: string, now = new Date()): Promise<boolean> {
  await ensureOpsTables()
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const row = await prisma.opsDecision.findFirst({
    where: { targetType, targetId, action, undoneAt: null, createdAt: { gt: since } },
    select: { id: true },
  })
  return !!row
}

export async function decide(input: DecisionInput): Promise<{ id: string }> {
  await ensureOpsTables()
  const row = await prisma.opsDecision.create({
    data: {
      kind: input.kind.slice(0, 80),
      targetType: input.targetType.slice(0, 80),
      targetId: input.targetId.slice(0, 80),
      action: input.action.slice(0, 80),
      reason: input.reason.slice(0, 2000),
      confidence: Number.isFinite(input.confidence) ? input.confidence : 0,
      actor: input.actor.slice(0, 80),
      before: input.before ?? undefined,
      after: input.after ?? undefined,
    },
    select: { id: true },
  })
  return row
}

export async function undoDecision(id: string, actor: string, now = new Date()): Promise<{ ok: true } | { ok: false; reason: string }> {
  await ensureOpsTables()
  const row = await prisma.opsDecision.findUnique({ where: { id } })
  if (!row) return { ok: false, reason: 'That decision is not on file.' }
  const allowed = undoAllowed(row.createdAt, row.undoneAt, now)
  if (!allowed.ok) return allowed
  const snapshot = snapshotOf(row.before)
  if (snapshot) await restoreSnapshot(snapshot)
  const grantId = row.after && typeof row.after === 'object' && !Array.isArray(row.after) && typeof (row.after as { grantId?: unknown }).grantId === 'string'
    ? (row.after as { grantId: string }).grantId
    : ''
  if (grantId) {
    await prisma.venueManagementGrant.update({
      where: { id: grantId },
      data: { status: 'REVOKED', revokedAt: now },
    }).catch(() => {})
  }
  await prisma.opsDecision.update({ where: { id }, data: { undoneAt: now } })
  await prisma.opsDecision.create({
    data: {
      kind: row.kind,
      targetType: row.targetType,
      targetId: row.targetId,
      action: 'undo',
      reason: `Undid ${row.action}. ${row.reason}`.slice(0, 2000),
      confidence: 1,
      actor: actor.slice(0, 80),
      before: row.after ?? undefined,
      after: row.before ?? undefined,
    },
  })
  return { ok: true }
}

export async function loadRuleConfig(): Promise<{ enabled: Record<RuleKey, boolean>; thresholds: Thresholds }> {
  await ensureOpsTables()
  const rows = await prisma.opsSetting.findMany()
  const enabled = Object.fromEntries(RULE_KEYS.map((key) => [key, true])) as Record<RuleKey, boolean>
  let thresholds = thresholdsFrom(null)
  for (const row of rows) {
    if (row.key === 'thresholds') thresholds = thresholdsFrom(row.value)
    else if ((RULE_KEYS as readonly string[]).includes(row.key)) enabled[row.key as RuleKey] = row.enabled
  }
  return { enabled, thresholds }
}

/** First run records now. Older backlog rows are left for the dry-run report. */
export async function readLiveSince(now = new Date()): Promise<Date> {
  await ensureOpsTables()
  const row = await prisma.opsSetting.findUnique({ where: { key: 'live-since' } })
  const raw = row?.value && typeof row.value === 'object' && row.value && 'since' in row.value
    ? String((row.value as { since: unknown }).since)
    : ''
  const parsed = raw ? new Date(raw) : null
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed
  await prisma.opsSetting.upsert({
    where: { key: 'live-since' },
    create: { key: 'live-since', enabled: true, value: { since: now.toISOString() } },
    update: { value: { since: now.toISOString() } },
  })
  return now
}

export function backlogApplyEnabled(): boolean {
  return process.env.OPS_RESOLVE_BACKLOG === '1'
}

export async function saveRuleConfig(input: { key: string; enabled?: boolean; thresholds?: Partial<Thresholds> }): Promise<void> {
  await ensureOpsTables()
  if (input.key === 'thresholds' && input.thresholds) {
    const current = await loadRuleConfig()
    const next = { ...current.thresholds, ...input.thresholds }
    await prisma.opsSetting.upsert({
      where: { key: 'thresholds' },
      create: { key: 'thresholds', enabled: true, value: next },
      update: { value: next },
    })
    return
  }
  if (!(RULE_KEYS as readonly string[]).includes(input.key) || typeof input.enabled !== 'boolean') return
  await prisma.opsSetting.upsert({
    where: { key: input.key },
    create: { key: input.key, enabled: input.enabled },
    update: { enabled: input.enabled },
  })
}


