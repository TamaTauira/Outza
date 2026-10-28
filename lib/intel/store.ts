// Versioned observation store: new imports are written under a new version and only swapped in once complete,
// so a failed or partial import never replaces the last good dataset.
import { prisma } from '@/lib/prisma'
import { sha } from './util'

export type ObsRow = {
  measure: string; geoType: string; geoCode: string; period: string; value: number | null
  unit?: string | null; unitMult?: number; adjustment?: string; category?: string; obsStatus?: string | null
}

export function versionOf(rows: ObsRow[]) {
  const keyed = rows.map((r) => `${r.measure}|${r.geoType}|${r.geoCode}|${r.period}|${r.adjustment ?? ''}|${r.category ?? ''}|${r.value}`).sort()
  return sha(keyed.join('\n'))
}

const latestOf = (rows: ObsRow[]) => rows.reduce<string | null>((m, r) => (!m || r.period > m ? r.period : m), null)

/** Write a dataset version, then atomically point the dataset at it and clean up older versions. */
export async function writeDataset(source: string, dataset: string, rows: ObsRow[]): Promise<{ version: string; changed: boolean; rows: number; latestPeriod: string | null }> {
  const id = `${source}:${dataset}`
  if (!rows.length) throw new Error(`${dataset}: the source returned no rows`)
  // dedupe on the unique key (keep last)
  const map = new Map<string, ObsRow>()
  for (const r of rows) map.set(`${r.measure}|${r.geoType}|${r.geoCode}|${r.period}|${r.adjustment ?? ''}|${r.category ?? ''}`, r)
  const uniq = [...map.values()]
  const version = versionOf(uniq)
  const latestPeriod = latestOf(uniq)
  const current = await prisma.intelDataset.findUnique({ where: { id } })
  if (current?.activeVersion === version) return { version, changed: false, rows: uniq.length, latestPeriod }

  // clear any half-written attempt of this same version, then insert
  await deleteVersionRows(source, dataset, (v) => v === version)
  for (let i = 0; i < uniq.length; i += 1000) {
    await prisma.intelObservation.createMany({
      data: uniq.slice(i, i + 1000).map((r) => ({
        source, dataset, version, measure: r.measure, geoType: r.geoType, geoCode: r.geoCode, period: r.period, value: r.value,
        unit: r.unit ?? null, unitMult: r.unitMult ?? 0, adjustment: r.adjustment ?? '', category: r.category ?? '', obsStatus: r.obsStatus ?? null,
      })),
      skipDuplicates: true,
    })
  }
  await prisma.intelDataset.upsert({
    where: { id }, create: { id, source, activeVersion: version, rows: uniq.length, latestPeriod },
    update: { activeVersion: version, rows: uniq.length, latestPeriod },
  })
  versionCache = null
  await deleteVersionRows(source, dataset, (v) => v !== version)
  return { version, changed: true, rows: uniq.length, latestPeriod }
}

async function deleteVersionRows(source: string, dataset: string, match: (v: string) => boolean) {
  const versions = await prisma.intelObservation.groupBy({ by: ['version'], where: { source, dataset } })
  for (const { version } of versions) {
    if (!match(version)) continue
    for (;;) {
      const ids = await prisma.intelObservation.findMany({ where: { source, dataset, version }, select: { id: true }, take: 4000 })
      if (!ids.length) break
      await prisma.intelObservation.deleteMany({ where: { id: { in: ids.map((x) => x.id) } } })
    }
  }
}

let versionCache: { at: number; map: Map<string, string> } | null = null
export async function activeVersions() {
  if (versionCache && Date.now() - versionCache.at < 60_000) return versionCache.map
  const all = await prisma.intelDataset.findMany({ select: { id: true, activeVersion: true } })
  versionCache = { at: Date.now(), map: new Map(all.map((d) => [d.id, d.activeVersion])) }
  return versionCache.map
}
export function clearVersionCache() { versionCache = null }

export type Obs = { measure: string; geoType: string; geoCode: string; period: string; value: number | null; unit: string | null; unitMult: number; adjustment: string; category: string; obsStatus: string | null }

/** Read observations of the ACTIVE version of a dataset only. */
export async function readObs(source: string, dataset: string, where: { measure?: string | { in: string[] }; geoType?: string; geoCode?: string | { in: string[] }; category?: string | { in: string[] }; adjustment?: string; period?: string | { gte?: string } } = {}): Promise<Obs[]> {
  const v = (await activeVersions()).get(`${source}:${dataset}`)
  if (!v) return []
  return prisma.intelObservation.findMany({
    where: { source, dataset, version: v, ...where },
    select: { measure: true, geoType: true, geoCode: true, period: true, value: true, unit: true, unitMult: true, adjustment: true, category: true, obsStatus: true },
    orderBy: { period: 'asc' },
  })
}

export async function datasetMeta(source: string) {
  return prisma.intelDataset.findMany({ where: { source } })
}
