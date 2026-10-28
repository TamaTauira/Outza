// Ingestion runner: change detection, retries (inside connectors), job logs, last-good retention and fault alerts.
// National ABS imports are chunked and checkpointed so a 300s function limit can resume instead of stalling.
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { reportFault } from '@/lib/owner-alerts'
import { INTEL_SOURCES, type SourceKey } from './sources'
import { absHsi, dnsw, tfnsw, type ConnectorResult } from './connectors'
import { runChunkedAbs } from './abs-run'
import { writeDataset } from './store'
import { googleConfigured, syncAllConnections } from './google'
import { sha } from './util'
import {
  asConfig, compareSourceRun, IMPORT_BUDGET_MS, isStaleRunning, NATIONAL_COVERAGE, NATIONAL_SOURCES,
  sourceIsDue, STALE_RUNNING_ERROR, STALE_RUNNING_MS,
} from './schedule'

const RUNNERS: Record<Exclude<SourceKey, 'google_bp' | 'abs_region' | 'abs_seifa'>, (cfg: Record<string, string> | null) => Promise<ConnectorResult>> = {
  abs_hsi: () => absHsi(), tfnsw: () => tfnsw(), dnsw: (cfg) => dnsw(cfg),
}

const running = new Set<string>()
const jsonConfig = (value: Record<string, unknown>) => value as Prisma.InputJsonValue

export async function ensureSources() {
  for (const key of Object.keys(INTEL_SOURCES)) await prisma.intelSource.upsert({ where: { key }, create: { key }, update: {} })
  await recoverStaleRunningSources()
}

/** A killed invocation stays `running` until something notices. Mark it failed so cron and admin can retry. */
export async function recoverStaleRunningSources(now = Date.now()) {
  const cutoff = new Date(now - STALE_RUNNING_MS)
  const stale = await prisma.intelSource.findMany({
    where: { status: 'running', OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }] },
  })
  for (const s of stale) {
    if (!isStaleRunning(s.status, s.lastCheckedAt, now)) continue
    const updated = await prisma.intelSource.update({
      where: { key: s.key },
      data: {
        status: 'failed',
        lastError: STALE_RUNNING_ERROR,
        failCount: { increment: 1 },
        config: jsonConfig({ ...asConfig(s.config), retryNow: true }),
      },
    })
    if (updated.failCount >= 2) {
      await reportFault({
        area: 'OUTZA Intelligence',
        key: `intel-${s.key}`,
        title: `${INTEL_SOURCES[s.key as SourceKey]?.name ?? s.key} import was stuck running`,
        detail: `${STALE_RUNNING_ERROR}\n\nThe last good dataset is still being served.`,
      })
    }
  }
}

export async function runSource(key: SourceKey, trigger: 'schedule' | 'admin' | 'cron' | 'test' = 'schedule', deadline = Date.now() + IMPORT_BUDGET_MS) {
  await ensureSources()
  if (running.has(key)) return { status: 'already_running' as const }
  running.add(key)
  try {
    const before = await prisma.intelSource.findUnique({ where: { key } })
    const prevCfg = asConfig(before?.config)
    const resume = !!before && (before.status === 'partial' || before.status === 'failed' || isStaleRunning(before.status, before.lastCheckedAt) || prevCfg.retryNow === true)
    const cutoff = new Date(Date.now() - STALE_RUNNING_MS)
    // Claim the row unless another invocation is still inside the stale window.
    const claimed = await prisma.intelSource.updateMany({
      where: { key, OR: [{ status: { not: 'running' } }, { lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }] },
      data: { status: 'running', lastCheckedAt: new Date() },
    })
    if (!claimed.count) return { status: 'already_running' as const }
    const job = await prisma.intelIngestJob.create({ data: { source: key, trigger } })
    if (prevCfg.retryNow) {
      const cfg = asConfig((await prisma.intelSource.findUnique({ where: { key } }))?.config)
      delete cfg.retryNow
      await prisma.intelSource.update({ where: { key }, data: { config: jsonConfig(cfg) } })
    }
    try {
      if (key === 'google_bp') return await runGoogle(key, job.id)
      if (key === 'abs_region' || key === 'abs_seifa') return await runAbs(key, before?.config, resume, deadline, job.id, before?.latestPeriod ?? null)
      const result = await RUNNERS[key]((before?.config as Record<string, string> | null) ?? null)
      return await finishConnector(key, job.id, before?.config, result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Config (including a chunk cursor) is left as the last checkpoint saved it.
      const s = await prisma.intelSource.update({ where: { key }, data: { status: 'failed', lastError: msg.slice(0, 2000), failCount: { increment: 1 } } })
      await prisma.intelIngestJob.update({ where: { id: job.id }, data: { status: 'failed', endedAt: new Date(), message: `${msg.slice(0, 2000)} (last good data kept)` } })
      if (s.failCount >= 2) await reportFault({ area: 'OUTZA Intelligence', key: `intel-${key}`, title: `${INTEL_SOURCES[key].name} import failed ${s.failCount} times in a row`, detail: `${msg}\n\nThe last good dataset is still being served.` })
      return { status: 'failed' as const, message: msg }
    }
  } finally { running.delete(key) }
}

async function runAbs(key: 'abs_region' | 'abs_seifa', config: unknown, resume: boolean, deadline: number, jobId: string, previousLatest: string | null) {
  const result = await runChunkedAbs({ source: key, config, resume, deadline })
  const cur = await prisma.intelSource.findUnique({ where: { key } })
  const cfg = asConfig(cur?.config)
  delete cfg.retryNow
  if (result.partial) {
    cfg.import = result.cursor
    await prisma.intelSource.update({
      where: { key },
      data: {
        status: 'partial', lastError: result.message, obsCount: result.rows,
        ...(result.latestPeriod ? { latestPeriod: result.latestPeriod } : previousLatest ? { latestPeriod: previousLatest } : {}),
        ...(result.changed ? { lastChangeAt: new Date() } : {}),
        config: jsonConfig(cfg),
      },
    })
    await prisma.intelIngestJob.update({ where: { id: jobId }, data: { status: 'partial', endedAt: new Date(), rows: result.rows, attempts: result.attempts, message: result.message } })
    if (result.changed) await prisma.intelCache.deleteMany({})
    return { status: 'partial' as const, message: result.message }
  }
  delete cfg.import
  cfg.datasetHashes = result.cursor.datasetHashes
  if (NATIONAL_SOURCES.has(key)) cfg.coverage = NATIONAL_COVERAGE
  const status = result.changed ? 'ok' : 'unchanged'
  await prisma.intelSource.update({
    where: { key },
    data: {
      status, lastSuccessAt: new Date(), ...(result.changed ? { lastChangeAt: new Date() } : {}),
      versionHash: result.versionHash, latestPeriod: result.latestPeriod, obsCount: result.rows, lastError: null, failCount: 0, config: jsonConfig(cfg),
    },
  })
  await prisma.intelIngestJob.update({ where: { id: jobId }, data: { status, endedAt: new Date(), rows: result.rows, attempts: result.attempts, versionHash: result.versionHash, message: result.message } })
  if (result.changed) await prisma.intelCache.deleteMany({})
  return { status, message: result.message }
}

async function runGoogle(key: 'google_bp', jobId: string) {
  if (!googleConfigured()) {
    await prisma.intelSource.update({ where: { key }, data: { status: 'needs_config', lastError: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set' } })
    await prisma.intelIngestJob.update({ where: { id: jobId }, data: { status: 'failed', endedAt: new Date(), message: 'Google OAuth client not configured' } })
    return { status: 'needs_config' as const }
  }
  const r = await syncAllConnections()
  const rows = await prisma.googleBusinessMetric.count()
  const status = r.total === 0 ? 'needs_config' : r.ok > 0 ? 'ok' : 'failed'
  const message = r.total === 0 ? 'No promoter has connected and chosen a Business Profile location yet' : `Synced ${r.ok}/${r.total} connected profiles`
  await prisma.intelSource.update({ where: { key }, data: { status, obsCount: rows, ...(r.ok ? { lastSuccessAt: new Date(), failCount: 0, lastError: null } : { lastError: message }) } })
  await prisma.intelIngestJob.update({ where: { id: jobId }, data: { status: r.ok || r.total === 0 ? 'ok' : 'failed', endedAt: new Date(), rows, message } })
  return { status, message }
}

async function finishConnector(key: Exclude<SourceKey, 'google_bp' | 'abs_region' | 'abs_seifa'>, jobId: string, config: unknown, result: ConnectorResult) {
  let changed = false, rows = 0, latest: string | null = null
  const versions: string[] = []
  for (const d of result.datasets) {
    const w = await writeDataset(key, d.dataset, d.rows)
    changed ||= w.changed; rows += w.rows; versions.push(w.version)
    if (w.latestPeriod && (!latest || w.latestPeriod > latest)) latest = w.latestPeriod
  }
  const extraRows = result.extra ? await result.extra() : 0
  const versionHash = sha(versions.join('|'))
  const status = changed ? 'ok' : 'unchanged'
  const message = [`${rows.toLocaleString('en-AU')} observations${extraRows ? ` + ${extraRows} stop locations` : ''}`, changed ? 'new version imported' : 'no change since last import', result.note].filter(Boolean).join('; ')
  const prevCfg = asConfig(config)
  delete prevCfg.retryNow
  await prisma.intelSource.update({ where: { key }, data: { status, lastSuccessAt: new Date(), ...(changed ? { lastChangeAt: new Date() } : {}), versionHash, latestPeriod: latest, obsCount: rows, lastError: null, failCount: 0, ...(NATIONAL_SOURCES.has(key) ? { config: { ...prevCfg, coverage: NATIONAL_COVERAGE } } : {}) } })
  await prisma.intelIngestJob.update({ where: { id: jobId }, data: { status, endedAt: new Date(), rows, attempts: result.attempts, versionHash, message } })
  if (changed) await prisma.intelCache.deleteMany({})
  return { status, message }
}

/** Run every enabled source whose schedule is due. Failures retry on the next hour (max every 6h after 3 fails). Chunked ABS imports resume on the next call. */
export async function runDueSources() {
  await ensureSources()
  const sources = await prisma.intelSource.findMany({ where: { enabled: true } })
  const deadline = Date.now() + IMPORT_BUDGET_MS
  const out: Record<string, string> = {}
  const ranked = [...sources].sort(compareSourceRun)
  for (const s of ranked) {
    if (Date.now() >= deadline) break
    const def = INTEL_SOURCES[s.key as SourceKey]
    if (!def) continue
    if (!sourceIsDue(s, def.scheduleHours)) continue
    const r = await runSource(s.key as SourceKey, 'schedule', deadline)
    out[s.key] = r.status
  }
  return out
}
