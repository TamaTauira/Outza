// Chunked TRA and footfall imports. Same checkpoint rules as the ABS imports.
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { chunkProgressMessage, readHashMap, sourceVersionHash } from './abs-plan'
import { runChunkPlan } from './chunk-run'
import { fetchCrowdChunk } from './crowd-fetch'
import { crowdChunks, crowdDatasetMin, crowdPlan, type CrowdChunk } from './crowd-plan'
import { asConfig } from './schedule'
import { activateDatasetVersion, activeDatasetVersion, appendDatasetRows, discardDatasetVersion } from './store'

export async function runChunkedCrowd(opts: {
  source: 'tra' | 'footfall'
  config: unknown
  resume: boolean
  deadline: number
}) {
  const chunks = crowdChunks(opts.source)
  const cfg = asConfig(opts.config)
  const result = await runChunkPlan<CrowdChunk>({
    plan: crowdPlan(opts.source),
    chunks,
    storedCursor: cfg.import,
    resume: opts.resume,
    previousHashes: readHashMap(cfg.datasetHashes),
    datasetMin: crowdDatasetMin(opts.source),
    deadline: opts.deadline,
    fetchChunk: (chunk) => fetchCrowdChunk(chunk),
    store: {
      append: (dataset, version, rows) => appendDatasetRows(opts.source, dataset, version, rows),
      activate: (dataset, version, rows, latestPeriod) => activateDatasetVersion(opts.source, dataset, version, rows, latestPeriod),
      discard: (dataset, version) => discardDatasetVersion(opts.source, dataset, version),
      activeVersion: (dataset) => activeDatasetVersion(opts.source, dataset),
    },
    onCheckpoint: async (cursor) => {
      const cur = await prisma.intelSource.findUnique({ where: { key: opts.source } })
      const next = asConfig(cur?.config)
      delete next.retryNow
      next.import = cursor
      await prisma.intelSource.update({ where: { key: opts.source }, data: { config: next as Prisma.InputJsonValue } })
    },
  })
  const done = chunks.filter((c) => result.cursor.done.includes(c.id) && result.cursor.hashes[c.id]).length
  const message = result.partial
    ? chunkProgressMessage(done, chunks.length, result.cursor.finished)
    : `${result.rows.toLocaleString('en-AU')} observations; ${result.changed ? 'new version imported' : 'no change since last import'}`
  return { ...result, message, versionHash: sourceVersionHash(result.cursor.datasetHashes) }
}
