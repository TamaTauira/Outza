// Runs a chunk list until the time budget runs out, checkpointing after every chunk.
// Datasets activate only when all of their chunks are stored. Unchanged content keeps the live version.
import { chunkSaved, datasetContentHash, newCursor, readCursor, type AbsImportCursor } from './abs-plan'
import { dedupeRows, latestPeriod, versionOf, type ObsRow } from './rows'
import { MIN_CHUNK_MS } from './schedule'

export type RunnableChunk = { id: string; dataset: string; minRows: number }

export type ChunkStore = {
  append(dataset: string, version: string, rows: ObsRow[]): Promise<void>
  activate(dataset: string, version: string, rows: number, latestPeriod: string | null): Promise<void>
  discard(dataset: string, version: string): Promise<void>
  activeVersion(dataset: string): Promise<string | null>
}

export type ChunkRunResult = {
  partial: boolean
  changed: boolean
  cursor: AbsImportCursor
  rows: number
  latestPeriod: string | null
  attempts: number
  activated: string[]
}

export async function runChunkPlan<C extends RunnableChunk>(opts: {
  plan: string
  chunks: C[]
  storedCursor: unknown
  resume: boolean
  previousHashes: Record<string, string>
  datasetMin: Record<string, number>
  deadline: number
  minSliceMs?: number
  now?: () => number
  fetchChunk: (chunk: C) => Promise<{ rows: ObsRow[]; attempts: number }>
  store: ChunkStore
  onCheckpoint: (cursor: AbsImportCursor) => Promise<void>
}): Promise<ChunkRunResult> {
  const now = opts.now ?? Date.now
  const minSlice = opts.minSliceMs ?? MIN_CHUNK_MS
  const datasets = [...new Set(opts.chunks.map((c) => c.dataset))]
  const existing = readCursor(opts.storedCursor)
  let cursor = opts.resume ? existing : null
  if (!cursor || cursor.plan !== opts.plan) {
    if (existing) await discardPending(opts.store, datasets, existing.pending)
    cursor = newCursor(opts.plan)
  }
  const current: AbsImportCursor = cursor

  let attempts = 0
  let changed = false
  const activated: string[] = []

  const checkpoint = async () => { await opts.onCheckpoint(current) }

  const finalize = async () => {
    for (const dataset of datasets) {
      if (current.finished.includes(dataset)) continue
      const mine = opts.chunks.filter((c) => c.dataset === dataset)
      if (!mine.every((c) => chunkSaved(current, c.id))) continue
      const rows = mine.reduce((n, c) => n + (current.chunkRows[c.id] ?? 0), 0)
      const min = opts.datasetMin[dataset] ?? 1
      if (rows < min) throw new Error(`${dataset} has ${rows} rows after all chunks; keeping last good data`)
      const hash = datasetContentHash(mine.map((c) => c.id), current.hashes)
      const active = await opts.store.activeVersion(dataset)
      if (active === current.pending) {
        // Activated on a previous attempt that died before the checkpoint.
      } else if (opts.previousHashes[dataset] && opts.previousHashes[dataset] === hash && active) {
        await opts.store.discard(dataset, current.pending)
      } else {
        await opts.store.activate(dataset, current.pending, rows, current.latest[dataset] ?? null)
        changed = true
        activated.push(dataset)
      }
      current.datasetHashes[dataset] = hash
      current.finished.push(dataset)
      await checkpoint()
    }
  }

  await finalize()

  for (const chunk of opts.chunks) {
    if (chunkSaved(current, chunk.id)) continue
    if (opts.deadline - now() < minSlice) {
      await checkpoint()
      return result(true)
    }
    const fetched = await opts.fetchChunk(chunk)
    attempts = Math.max(attempts, fetched.attempts)
    const rows = dedupeRows(fetched.rows)
    if (rows.length < chunk.minRows) throw new Error(`${chunk.id} returned too few rows (${rows.length}); keeping last good data`)
    await opts.store.append(chunk.dataset, current.pending, rows)
    current.done.push(chunk.id)
    current.hashes[chunk.id] = versionOf(rows)
    current.chunkRows[chunk.id] = rows.length
    const latest = latestPeriod(rows)
    if (latest && (!current.latest[chunk.dataset] || latest > current.latest[chunk.dataset]!)) current.latest[chunk.dataset] = latest
    await checkpoint()
    await finalize()
  }

  return result(opts.chunks.some((c) => !chunkSaved(current, c.id)) || datasets.some((d) => !current.finished.includes(d)))

  function result(partial: boolean): ChunkRunResult {
    const latest = Object.values(current.latest).reduce<string | null>((m, v) => (!v || (m && m > v) ? m : v), null)
    const rows = Object.values(current.chunkRows).reduce((n, v) => n + v, 0)
    return { partial, changed, cursor: current, rows, latestPeriod: latest, attempts, activated }
  }
}

async function discardPending(store: ChunkStore, datasets: string[], version: string) {
  for (const dataset of datasets) {
    if ((await store.activeVersion(dataset)) === version) continue
    await store.discard(dataset, version)
  }
}
