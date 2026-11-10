import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  accuracyPct,
  acquisitionCostCents,
  addMonths,
  cumulativeByMonth,
  discoveryPct,
  emailRates,
  monthEndsAt,
  mrrSeries,
  payerMonths,
  recentMonths,
  recentWeekStarts,
  revenuePerBusinessCents,
  sharePct,
  sydneyDay,
  sydneyMonth,
  weeklyReturning,
  type PlanSnap,
} from '@/lib/commercial-metrics'

const FLAG_ACTIONS = [
  'DUPLICATE_FLAGGED',
  'DUPLICATE_MERGED',
  'EXPIRED_HIDDEN',
  'TIME_CONFLICT',
  'MISSING_COORDS',
  'SUSPECT_IMAGE',
  'SOURCE_FAILURE',
  'SOURCE_CHANGED',
  'SOURCE_MISSING',
]

function num(value: unknown): number {
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return 0
}

export function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  if (code === 'P2021' || code === 'P2022') return true
  return /does not exist|42P01|P2021|P2022/i.test(String((err as { message?: string })?.message ?? ''))
}

async function optional<T>(fn: () => Promise<T>, fallback: T, label: string, missing: string[]): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (!isMissingTable(err)) throw err
    missing.push(label)
    return fallback
  }
}

export type Dashboard = {
  generatedAt: string
  currentMonth: string
  today: string
  setup: string | null
  audienceReady: boolean
  discoveryReady: boolean
  spendReady: boolean
  audienceStarted: Date | null
  discoveryStarted: Date | null
  mau: { month: string; n: number }[]
  returning: { week: string; active: number; returning: number; rate: number | null }[]
  catalogue: { month: string; total: number; added: number }[]
  accuracy: { month: string; pct: number | null }[]
  trust: { reports: number; flags: number; checks: number; duplicatePct: number | null; expiredPct: number | null }
  discovery: { week: string; searches: number; clicks: number; pct: number | null }[]
  email: { month: string; sent: number; open: number | null; click: number | null }[]
  payers: { month: string; revenue: number; payers: number; fresh: number; spend: number | null; cac: number | null; each: number | null }[]
  mrr: { month: string; mrrCents: number; subscribers: number }[]
  savedSpend: { month: string; amountCents: number; note: string | null }[]
}

export async function loadCommercialMetrics(now = new Date()): Promise<Dashboard> {
  const missing: string[] = []
  const currentMonth = sydneyMonth(now)
  const today = sydneyDay(now)
  const months = recentMonths(now, 12)
  const weeks = recentWeekStarts(today, 13)
  const shownWeeks = weeks.slice(1)
  const monthStart = monthEndsAt(addMonths(currentMonth, -1))
  const monthEnd = monthEndsAt(currentMonth)
  const actions = Prisma.join(FLAG_ACTIONS)

  const [
    epochs,
    audienceMonths,
    audienceWeeks,
    discoveryWeeks,
    spends,
    added,
    snapshot,
    problems,
    reports,
    flags,
    checks,
    sent,
    clickers,
    subs,
    paid,
  ] = await Promise.all([
    optional(() => prisma.metricEpoch.findMany(), [], 'audience', missing),
    optional(() => prisma.$queryRaw<{ month: string; n: unknown }[]>`
      SELECT substring(day from 1 for 7) AS month, count(DISTINCT "visitorId")::int AS n
      FROM "AudienceDay"
      WHERE day >= ${`${months[0]}-01`}
      GROUP BY 1
    `, [], 'audience', missing),
    optional(() => prisma.$queryRaw<{ visitorId: string; week: string }[]>`
      SELECT "visitorId" AS "visitorId",
        (day::date - ((EXTRACT(DOW FROM day::date)::int + 6) % 7))::text AS week
      FROM "AudienceDay"
      WHERE day >= ${weeks[0]}
      GROUP BY 1, 2
    `, [], 'audience', missing),
    optional(() => prisma.$queryRaw<{ week: string; searches: unknown; clicks: unknown }[]>`
      SELECT (day::date - ((EXTRACT(DOW FROM day::date)::int + 6) % 7))::text AS week,
        count(*)::int AS searches,
        count(*) FILTER (WHERE clicked)::int AS clicks
      FROM "DiscoverySearch"
      WHERE day >= ${shownWeeks[0]}
      GROUP BY 1
    `, [], 'discovery', missing),
    optional(() => prisma.marketingSpend.findMany({ orderBy: { month: 'asc' } }), [], 'spend', missing),
    optional(() => prisma.$queryRaw<{ month: string; n: unknown }[]>`
      SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney', 'YYYY-MM') AS month,
        count(*)::int AS n
      FROM "Event"
      WHERE "duplicateOfId" IS NULL AND "deletedAt" IS NULL
      GROUP BY 1
    `, [], 'events', missing),
    optional(() => prisma.$queryRaw<{ canonical: unknown; duplicates: unknown; expired: unknown; inwindow: unknown }[]>`
      SELECT
        count(*) FILTER (WHERE "deletedAt" IS NULL AND "duplicateOfId" IS NULL)::int AS canonical,
        count(*) FILTER (WHERE "deletedAt" IS NULL AND "duplicateOfId" IS NOT NULL)::int AS duplicates,
        count(*) FILTER (
          WHERE "deletedAt" IS NULL AND "duplicateOfId" IS NULL AND status = 'SCHEDULED'
            AND "date" >= (now() AT TIME ZONE 'Australia/Sydney')::date
        )::int AS inwindow,
        count(*) FILTER (
          WHERE "deletedAt" IS NULL AND "duplicateOfId" IS NULL AND status = 'SCHEDULED'
            AND "date" >= (now() AT TIME ZONE 'Australia/Sydney')::date
            AND "endsAt" IS NOT NULL
            AND "endsAt" AT TIME ZONE 'UTC' < now()
        )::int AS expired
      FROM "Event"
    `, [], 'events', missing),
    optional(() => prisma.$queryRaw<{ month: string; n: unknown }[]>`
      SELECT month, count(*)::int AS n FROM (
        SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney', 'YYYY-MM') AS month,
          "eventId" AS eid
        FROM "EventReport"
        WHERE "eventId" IS NOT NULL
        UNION
        SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney', 'YYYY-MM'),
          COALESCE("eventId", "id")
        FROM "QualityAudit"
        WHERE action IN (${actions})
        UNION
        SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney', 'YYYY-MM'),
          COALESCE("eventId", "id")
        FROM "VerificationCheck"
        WHERE outcome = 'flag'
      ) u
      GROUP BY month
    `, [], 'trust', missing),
    optional(() => prisma.eventReport.count({ where: { createdAt: { gte: monthStart, lt: monthEnd } } }), 0, 'trust', missing),
    optional(() => prisma.qualityAudit.count({ where: { createdAt: { gte: monthStart, lt: monthEnd }, action: { in: [...FLAG_ACTIONS] } } }), 0, 'trust', missing),
    optional(() => prisma.verificationCheck.count({ where: { createdAt: { gte: monthStart, lt: monthEnd }, outcome: 'flag' } }), 0, 'trust', missing),
    optional(() => prisma.$queryRaw<{ month: string; sent: unknown; opened: unknown }[]>`
      SELECT to_char("sentAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney', 'YYYY-MM') AS month,
        count(*) FILTER (WHERE status = 'SENT')::int AS sent,
        count(*) FILTER (WHERE status = 'SENT' AND "openedAt" IS NOT NULL)::int AS opened
      FROM "NewsletterSend"
      GROUP BY 1
    `, [], 'email', missing),
    optional(() => prisma.$queryRaw<{ month: string; clickers: unknown }[]>`
      SELECT to_char(s."sentAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney', 'YYYY-MM') AS month,
        count(DISTINCT c."sendId")::int AS clickers
      FROM "NewsletterClick" c
      JOIN "NewsletterSend" s ON s.id = c."sendId"
      WHERE s.status = 'SENT'
      GROUP BY 1
    `, [], 'email', missing),
    optional(() => prisma.organiserSubscription.findMany({
      select: { status: true, amountCents: true, cancelAtPeriodEnd: true, createdAt: true, updatedAt: true, currentPeriodStart: true },
    }), [], 'plans', missing),
    paidRows(missing),
  ])

  const audienceStarted = epochs.find((row) => row.key === 'audience')?.startedAt ?? null
  const discoveryStarted = epochs.find((row) => row.key === 'discovery')?.startedAt ?? null
  const catalogue = cumulativeByMonth(added.map((row) => ({ month: row.month, n: num(row.n) })), months)
  const catalogueAt = new Map(catalogue.map((row) => [row.month, row.total]))
  const problemAt = new Map(problems.map((row) => [row.month, num(row.n)]))
  const snap = snapshot[0]
  const canonical = num(snap?.canonical)
  const duplicates = num(snap?.duplicates)
  const expired = num(snap?.expired)
  const inWindow = num(snap?.inwindow)
  const sentAt = new Map(sent.map((row) => [row.month, { sent: num(row.sent), opened: num(row.opened) }]))
  const clickAt = new Map(clickers.map((row) => [row.month, num(row.clickers)]))
  const spendAt = new Map(spends.map((row) => [row.month, row.amountCents]))
  const paidAt = payerMonths(paid)
  const plans = subs as PlanSnap[]
  const dayKey = (value: string) => value.slice(0, 10)
  const discoveryAt = new Map(discoveryWeeks.map((row) => [dayKey(row.week), { searches: num(row.searches), clicks: num(row.clicks) }]))
  const mauAt = new Map(audienceMonths.map((row) => [row.month, num(row.n)]))
  const returning = weeklyReturning(audienceWeeks.map((row) => ({ visitorId: row.visitorId, week: dayKey(row.week) })), weeks).slice(1)
  const uniqueMissing = [...new Set(missing)]
  const needsSql = ['audience', 'discovery', 'spend'].some((key) => uniqueMissing.includes(key))
  const setup = needsSql
    ? 'Audience, search and marketing-spend tables are not on this database yet. Apply prisma/sql/20261110_commercial_metrics.sql, then reload. Listings, editions and plans still show from the tables already there.'
    : null

  return {
    generatedAt: now.toISOString(),
    currentMonth,
    today,
    setup,
    audienceReady: !needsSql || !uniqueMissing.includes('audience'),
    discoveryReady: !uniqueMissing.includes('discovery'),
    spendReady: !uniqueMissing.includes('spend'),
    audienceStarted,
    discoveryStarted,
    mau: months.map((month) => ({ month, n: mauAt.get(month) ?? 0 })),
    returning,
    catalogue,
    accuracy: months.map((month) => ({ month, pct: accuracyPct(problemAt.get(month) ?? 0, catalogueAt.get(month) ?? 0) })),
    trust: {
      reports,
      flags,
      checks,
      duplicatePct: sharePct(duplicates, canonical + duplicates),
      expiredPct: sharePct(expired, inWindow),
    },
    discovery: shownWeeks.map((week) => {
      const row = discoveryAt.get(week) ?? { searches: 0, clicks: 0 }
      return { week, searches: row.searches, clicks: row.clicks, pct: discoveryPct(row.searches, row.clicks) }
    }),
    email: months.map((month) => {
      const row = sentAt.get(month) ?? { sent: 0, opened: 0 }
      const rates = emailRates(row.sent, row.opened, clickAt.get(month) ?? 0)
      return { month, sent: row.sent, open: rates.open, click: rates.click }
    }),
    payers: months.map((month) => {
      const row = paidAt.get(month) ?? { revenue: 0, payers: 0, fresh: 0 }
      const spend = spendAt.has(month) ? spendAt.get(month)! : null
      return {
        month,
        revenue: row.revenue,
        payers: row.payers,
        fresh: row.fresh,
        spend,
        cac: acquisitionCostCents(spend, row.fresh),
        each: revenuePerBusinessCents(row.revenue, row.payers),
      }
    }),
    mrr: mrrSeries(plans, months, now),
    savedSpend: spends.map((row) => ({ month: row.month, amountCents: row.amountCents, note: row.note })),
  }
}

async function paidRows(missing: string[]): Promise<{ payer: string; month: string; cents: number }[]> {
  const queries = [
    prisma.$queryRaw<{ payer: string; month: string; cents: unknown }[]>`
      SELECT "promoterId" AS payer,
        to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney', 'YYYY-MM') AS month,
        sum("amountCents")::int AS cents
      FROM "Campaign"
      WHERE "paymentMode" = 'stripe' AND status IN ('ACTIVE', 'EXPIRED', 'PAUSED') AND "amountCents" > 0
      GROUP BY 1, 2
    `,
    prisma.$queryRaw<{ payer: string; month: string; cents: unknown }[]>`
      SELECT "promoterId" AS payer,
        to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney', 'YYYY-MM') AS month,
        sum("amountCents")::int AS cents
      FROM "Promotion"
      WHERE "paymentMode" = 'stripe' AND status IN ('ACTIVE', 'EXPIRED') AND "amountCents" > 0
      GROUP BY 1, 2
    `,
    prisma.$queryRaw<{ payer: string; month: string; cents: unknown }[]>`
      SELECT "userId" AS payer,
        to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney', 'YYYY-MM') AS month,
        sum("amountCents")::int AS cents
      FROM "SubscriptionCharge"
      WHERE status = 'PAID' AND "amountCents" > 0
      GROUP BY 1, 2
    `,
    prisma.$queryRaw<{ payer: string; month: string; cents: unknown }[]>`
      SELECT "userId" AS payer,
        to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney', 'YYYY-MM') AS month,
        sum("amountCents")::int AS cents
      FROM "VenuePlacement"
      WHERE "paymentMode" = 'stripe' AND status IN ('ACTIVE', 'EXPIRED') AND "amountCents" > 0
      GROUP BY 1, 2
    `,
  ]
  const chunks = await Promise.all(queries.map((query, i) => optional(
    () => query,
    [] as { payer: string; month: string; cents: unknown }[],
    ['campaigns', 'packages', 'plans', 'venues'][i],
    missing,
  )))
  return chunks.flat().map((row) => ({ payer: row.payer, month: row.month, cents: num(row.cents) }))
}
