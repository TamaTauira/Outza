// Ingestion runner: change detection, retries (inside connectors), job logs, last-good retention and fault alerts.
import { prisma } from '@/lib/prisma'
import { reportFault } from '@/lib/owner-alerts'
import { INTEL_SOURCES, type SourceKey } from './sources'
import { absHsi, absRegion, absSeifa, dnsw, tfnsw, type ConnectorResult } from './connectors'
import { writeDataset } from './store'
import { googleConfigured, syncAllConnections } from './google'
import { sha } from './util'

const RUNNERS: Record<Exclude<SourceKey, 'google_bp'>, (cfg: Record<string, string> | null) => Promise<ConnectorResult>> = {
  abs_region: () => absRegion(), abs_seifa: () => absSeifa(), abs_hsi: () => absHsi(), tfnsw: () => tfnsw(), dnsw: (cfg) => dnsw(cfg),
}

const running = new Set<string>()

export async function ensureSources() {
  for (const key of Object.keys(INTEL_SOURCES)) await prisma.intelSource.upsert({ where: { key }, create: { key }, update: {} })
}

export async function runSource(key: SourceKey, trigger: 'schedule' | 'admin' | 'cron' | 'test' = 'schedule') {
  await ensureSources()
  if (running.has(key)) return { status: 'already_running' as const }
  running.add(key)
  const job = await prisma.intelIngestJob.create({ data: { source: key, trigger } })
  const src = await prisma.intelSource.findUnique({ where: { key } })
  await prisma.intelSource.update({ where: { key }, data: { status: 'running', lastCheckedAt: new Date() } })
  try {
    if (key === 'google_bp') {
      if (!googleConfigured()) {
        await prisma.intelSource.update({ where: { key }, data: { status: 'needs_config', lastError: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set' } })
        await prisma.intelIngestJob.update({ where: { id: job.id }, data: { status: 'failed', endedAt: new Date(), message: 'Google OAuth client not configured' } })
        return { status: 'needs_config' as const }
      }
      const r = await syncAllConnections()
      const rows = await prisma.googleBusinessMetric.count()
      const status = r.total === 0 ? 'needs_config' : r.ok > 0 ? 'ok' : 'failed'
      const message = r.total === 0 ? 'No promoter has connected and chosen a Business Profile location yet' : `Synced ${r.ok}/${r.total} connected profiles`
      await prisma.intelSource.update({ where: { key }, data: { status, obsCount: rows, ...(r.ok ? { lastSuccessAt: new Date(), failCount: 0, lastError: null } : { lastError: message }) } })
      await prisma.intelIngestJob.update({ where: { id: job.id }, data: { status: r.ok || r.total === 0 ? 'ok' : 'failed', endedAt: new Date(), rows, message } })
      return { status, message }
    }
    const result = await RUNNERS[key]((src?.config as Record<string, string> | null) ?? null)
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
    await prisma.intelSource.update({ where: { key }, data: { status, lastSuccessAt: new Date(), ...(changed ? { lastChangeAt: new Date() } : {}), versionHash, latestPeriod: latest, obsCount: rows, lastError: null, failCount: 0 } })
    await prisma.intelIngestJob.update({ where: { id: job.id }, data: { status, endedAt: new Date(), rows, attempts: result.attempts, versionHash, message } })
    if (changed) await prisma.intelCache.deleteMany({})
    return { status, message }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const s = await prisma.intelSource.update({ where: { key }, data: { status: 'failed', lastError: msg.slice(0, 2000), failCount: { increment: 1 } } })
    await prisma.intelIngestJob.update({ where: { id: job.id }, data: { status: 'failed', endedAt: new Date(), message: `${msg.slice(0, 2000)} (last good data kept)` } })
    if (s.failCount >= 2) await reportFault({ area: 'OUTZA Intelligence', key: `intel-${key}`, title: `${INTEL_SOURCES[key].name} import failed ${s.failCount} times in a row`, detail: `${msg}\n\nThe last good dataset is still being served.` })
    return { status: 'failed' as const, message: msg }
  } finally { running.delete(key) }
}

/** Hourly: run every enabled source whose schedule is due. Failures retry on the next hour (max every 6h after 3 fails). */
export async function runDueSources() {
  await ensureSources()
  const sources = await prisma.intelSource.findMany({ where: { enabled: true } })
  const out: Record<string, string> = {}
  for (const s of sources) {
    const def = INTEL_SOURCES[s.key as SourceKey]
    if (!def) continue
    const last = s.lastCheckedAt?.getTime() ?? 0
    const interval = s.status === 'failed' ? Math.min(def.scheduleHours, s.failCount >= 3 ? 6 : 1) : def.scheduleHours
    if (Date.now() - last < interval * 3600_000) continue
    const r = await runSource(s.key as SourceKey, 'schedule')
    out[s.key] = r.status
  }
  return out
}
