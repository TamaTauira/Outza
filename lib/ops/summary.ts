import { PrismaClient } from '@prisma/client'
import { pooledDatabaseUrl } from '@/lib/db-url'
import { opsReadDatabaseRole } from '@/lib/ops/read-auth'

let client: PrismaClient | null = null

function db(): PrismaClient {
  if (!client) {
    const raw = process.env.DATABASE_URL_READONLY?.trim() || process.env.DATABASE_URL
    const url = pooledDatabaseUrl(raw, { connectionLimit: 1, poolTimeoutSeconds: 10 })
    client = new PrismaClient(url ? { datasources: { db: { url } } } : undefined)
  }
  return client
}

function num(value: unknown): number {
  return typeof value === 'bigint' ? Number(value) : Number(value) || 0
}

/** Read-only snapshot for a bot. No writes. */
export async function opsSummary(now = new Date()) {
  const prisma = db()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const [
    reports, claims, flags, duplicateReview, digestOpen, held, decisions, faults, newsletter, sources, unclicked, askOk, askErr,
  ] = await Promise.all([
    prisma.eventReport.count({ where: { status: 'OPEN' } }),
    prisma.eventClaim.count({ where: { status: 'PENDING' } }),
    prisma.qualityAudit.count({ where: { status: 'OPEN', action: { not: 'DUPLICATE_REVIEW' } } }),
    prisma.qualityAudit.count({ where: { status: 'OPEN', action: 'DUPLICATE_REVIEW' } }),
    prisma.opsDigestItem.count({ where: { status: 'OPEN' } }).catch(() => 0),
    prisma.event.count({ where: { moderationStatus: 'review' } }),
    prisma.opsDecision.findMany({ orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, kind: true, action: true, reason: true, confidence: true, actor: true, undoneAt: true, createdAt: true } }).catch(() => []),
    prisma.ownerAlert.findMany({ where: { kind: 'FAULT' }, orderBy: { lastSeen: 'desc' }, take: 20, select: { key: true, title: true, count: true, lastSeen: true } }),
    prisma.newsletterSend.groupBy({ by: ['status'], where: { sentAt: { gte: weekAgo } }, _count: { _all: true } }),
    prisma.$queryRaw<{ status: string; startedAt: Date; endedAt: Date | null; eventsAdded: number }[]>`
      SELECT DISTINCT ON (status) status, "startedAt", "endedAt", "eventsAdded"
      FROM "RefreshLog"
      WHERE status LIKE 'source:%'
      ORDER BY status, "startedAt" DESC
    `,
    prisma.$queryRaw<{ queryKey: string; n: number }[]>`
      SELECT "queryKey", count(*)::int AS n
      FROM "DiscoverySearch"
      WHERE clicked = false AND "createdAt" >= ${weekAgo}
      GROUP BY "queryKey"
      ORDER BY n DESC
      LIMIT 10
    `.catch(() => []),
    prisma.analyticsCounter.findUnique({ where: { key: 'ask_ok' }, select: { count: true } }).catch(() => null),
    prisma.analyticsCounter.findUnique({ where: { key: 'ask_error' }, select: { count: true } }).catch(() => null),
  ])
  let contact: Record<string, number> | null = null
  try {
    const rows = await prisma.$queryRaw<{ status: string; n: number }[]>`
      SELECT status, count(*)::int AS n FROM "ContactMessage" GROUP BY status
    `
    contact = Object.fromEntries(rows.map((row) => [row.status, num(row.n)]))
  } catch {
    contact = null
  }
  const ok = askOk?.count ?? 0
  const errors = askErr?.count ?? 0
  const asks = ok + errors
  return {
    generatedAt: now.toISOString(),
    databaseRole: opsReadDatabaseRole(),
    queues: { reports, claims, flags, duplicateReview, digestOpen, held },
    decisions: decisions.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), undoneAt: row.undoneAt?.toISOString() ?? null })),
    contactMessages: contact ?? { unavailable: true },
    sources: sources.map((row) => ({
      source: row.status.replace(/^source:/, ''),
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      eventsAdded: row.eventsAdded,
    })),
    faults: faults.map((row) => ({ key: row.key, title: row.title, count: row.count, lastSeen: row.lastSeen.toISOString() })),
    newsletter: Object.fromEntries(newsletter.map((row) => [row.status, row._count._all])),
    unclickedQueryKeys: unclicked.map((row) => ({ queryKey: row.queryKey, count: num(row.n) })),
    ask: { ok, errors, errorRate: asks ? errors / asks : null },
  }
}
