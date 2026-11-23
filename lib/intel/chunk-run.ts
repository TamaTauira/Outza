// Runs a chunk list until the time budget runs out, checkpointing after every chunk.
// Datasets activate only when all of their chunks are stored. Unchanged content keeps the live version.
// Row cleanup is checkpointed first and stops at the deadline, so a large delete cannot leave status=running.
import { chunkSaved, datasetContentHash, newCursor, readCursor, type AbsImportCursor } from './abs-plan'
import { isBudgetStop } from './budget'
import { dedupeRows, latestPeriod, versionOf, type ObsRow } from './rows'
import { MIN_CHUNK_MS } from './schedule'

export type RunnableChunk = { id: string; dataset: string; minRows: number }

export type ChunkStore = {
  append(dataset: string, version: string, rows: ObsRow[]): Promise<void>
  activate(dataset: string, version: string, rows: number, latestPeriod: string | null): Promise<void>
  /** False when the time budget stopped the delete before every pending row was gone. */
  discard(dataset: string, version: string): Promise<void | boolean>
  activeVersion(dataset: string): Promise<string | null>
  /** Rows stored for this version. Used to avoid publishing a copy that a killed cleanup already ate. */
  count?(dataset: string, version: string): Promise<number>
  /** Drop versions other than the live one. False when the budget stops the delete. */
  sweep?(dataset: string, pending: string): Promise<boolean>
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
  let blocked = false
  if (!cursor || cursor.plan !== opts.plan) {
    if (existing) blocked = !(await discardPending(opts.store, datasets, existing.pending))
    if (!blocked) cursor = newCursor(opts.plan)
    else cursor = existing
  }
  const current: AbsImportCursor = cursor!

  let attempts = 0
  let changed = false
  let needsCleanup = false
  const activated: string[] = []
  const requeued = new Set<string>()

  const checkpoint = async () => { await opts.onCheckpoint(current) }
  const outOfTime = () => opts.deadline - now() < minSlice
  if (blocked) return result(true)

  const sweep = async () => {
    for (const dataset of datasets) {
      if (!current.finished.includes(dataset)) continue
      if (outOfTime()) { needsCleanup = true; return }
      const active = await opts.store.activeVersion(dataset)
      if (active && active !== current.pending) {
        const ok = await opts.store.discard(dataset, current.pending)
        if (ok === false || outOfTime()) { needsCleanup = true; return }
      } else if (active && opts.store.sweep) {
        const ok = await opts.store.sweep(dataset, current.pending)
        if (ok === false || outOfTime()) { needsCleanup = true; return }
      }
    }
  }

  const finalize = async () => {
    for (const dataset of datasets) {
      if (needsCleanup || current.finished.includes(dataset)) continue
      if (outOfTime()) return
      const mine = opts.chunks.filter((c) => c.dataset === dataset)
      if (!mine.every((c) => chunkSaved(current, c.id))) continue
      const rows = mine.reduce((n, c) => n + (current.chunkRows[c.id] ?? 0), 0)
      const min = opts.datasetMin[dataset] ?? 1
      if (rows < min) throw new Error(`${dataset} has ${rows} rows after all chunks; keeping last good data`)
      const hash = datasetContentHash(mine.map((c) => c.id), current.hashes)
      const active = await opts.store.activeVersion(dataset)
      const unchanged = !!(active && opts.previousHashes[dataset] && opts.previousHashes[dataset] === hash)
      if (active === current.pending || unchanged) {
        // Pointer already moved, or the live file matches. Cleanup drops the spare copy after the checkpoint.
      } else {
        if (opts.store.count) {
          const stored = await opts.store.count(dataset, current.pending)
          if (stored < rows) {
            // A killed cleanup removed rows from this version. Do not publish the hole; fetch the chunks again.
            if (requeued.has(dataset)) { needsCleanup = true; return }
            requeued.add(dataset)
            const ids = new Set(mine.map((c) => c.id))
            current.done = current.done.filter((id) => !ids.has(id))
            for (const id of ids) {
              delete current.hashes[id]
              delete current.chunkRows[id]
            }
            await checkpoint()
            continue
          }
        }
        await opts.store.activate(dataset, current.pending, rows, current.latest[dataset] ?? null)
        changed = true
        activated.push(dataset)
      }
      current.datasetHashes[dataset] = hash
      current.finished.push(dataset)
      await checkpoint()
      await sweep()
    }
  }

  await finalize()
  await sweep()
  if (needsCleanup || outOfTime()) return result(true)

  for (const chunk of opts.chunks) {
    if (chunkSaved(current, chunk.id)) continue
    if (outOfTime()) {
      await checkpoint()
      return result(true)
    }
    let fetched: { rows: ObsRow[]; attempts: number }
    try {
      fetched = await opts.fetchChunk(chunk)
    } catch (e) {
      if (isBudgetStop(e)) {
        await checkpoint()
        return result(true)
      }
      throw e
    }
    attempts = Math.max(attempts, fetched.attempts)
    const rows = dedupeRows(fetched.rows)
    if (rows.length < chunk.minRows) throw new Error(`${chunk.id} returned too few rows (${rows.length}); keeping last good data`)
    try {
      await opts.store.append(chunk.dataset, current.pending, rows)
    } catch (e) {
      if (isBudgetStop(e)) {
        await checkpoint()
        return result(true)
      }
      throw e
    }
    current.done.push(chunk.id)
    current.hashes[chunk.id] = versionOf(rows)
    current.chunkRows[chunk.id] = rows.length
    const latest = latestPeriod(rows)
    if (latest && (!current.latest[chunk.dataset] || latest > current.latest[chunk.dataset]!)) current.latest[chunk.dataset] = latest
    await checkpoint()
    await finalize()
    if (needsCleanup || outOfTime()) return result(true)
  }

  await sweep()
  return result(needsCleanup || opts.chunks.some((c) => !chunkSaved(current, c.id)) || datasets.some((d) => !current.finished.includes(d)))

  function result(partial: boolean): ChunkRunResult {
    const latest = Object.values(current.latest).reduce<string | null>((m, v) => (!v || (m && m > v) ? m : v), null)
    const rows = Object.values(current.chunkRows).reduce((n, v) => n + v, 0)
    return { partial, changed, cursor: current, rows, latestPeriod: latest, attempts, activated }
  }
}

async function discardPending(store: ChunkStore, datasets: string[], version: string) {
  for (const dataset of datasets) {
    if ((await store.activeVersion(dataset)) === version) continue
    if (await store.discard(dataset, version) === false) return false
  }
  return true
}
