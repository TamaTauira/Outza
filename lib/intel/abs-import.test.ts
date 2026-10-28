import assert from 'node:assert/strict'
import { test } from 'node:test'
import { absRegionChunks, absSeifaChunks, chunkProgressMessage, isOpenImport, mapChunkRows, newCursor, type AbsChunk } from './abs-plan'
import { runChunkPlan } from './chunk-run'
import { IMPORT_BUDGET_MS, STALE_RUNNING_MS, isStaleRunning, sourceIsDue, sourceRunRank } from './schedule'
import { SEIFA_PREFERENCE, loadSeifaIndexes, seifaCandidates, seifaRowsToIndexes } from './seifa'
import { INTEL_SOURCES } from './sources'
import type { ObsRow } from './rows'

const at = (iso: string) => new Date(iso)

test('running longer than 20 minutes is stale and due even on a weekly schedule', () => {
  const now = Date.parse('2026-10-28T16:00:00Z')
  const fresh = new Date(now - STALE_RUNNING_MS + 1)
  const stale = new Date(now - STALE_RUNNING_MS)
  assert.equal(isStaleRunning('running', fresh, now), false)
  assert.equal(isStaleRunning('running', stale, now), true)
  assert.equal(isStaleRunning('running', null, now), true)
  assert.equal(isStaleRunning('ok', stale, now), false)
  const weekly = {
    key: 'abs_region', status: 'running', lastCheckedAt: stale, failCount: 0,
    config: { coverage: 'au-cities-v1' }, lastSuccessAt: at('2026-01-01T00:00:00Z'),
  }
  assert.equal(sourceIsDue(weekly, 24 * 7, now), true)
  assert.equal(sourceIsDue({ ...weekly, status: 'running', lastCheckedAt: fresh }, 24 * 7, now), false)
})

test('partial imports and retryNow skip the weekly wait', () => {
  const now = Date.parse('2026-10-28T16:00:00Z')
  const recent = new Date(now - 60_000)
  assert.equal(sourceIsDue({ key: 'abs_seifa', status: 'partial', lastCheckedAt: recent, failCount: 5, config: { coverage: 'au-cities-v1' } }, 24 * 30, now), true)
  assert.equal(sourceIsDue({ key: 'abs_seifa', status: 'failed', lastCheckedAt: recent, failCount: 5, config: { retryNow: true, coverage: 'au-cities-v1' } }, 24 * 30, now), true)
  assert.equal(sourceIsDue({ key: 'abs_seifa', status: 'failed', lastCheckedAt: recent, failCount: 0, config: { coverage: 'au-cities-v1' }, lastSuccessAt: recent }, 24 * 30, now), false)
  assert.equal(sourceIsDue({ key: 'abs_region', status: 'failed', lastCheckedAt: recent, failCount: 4, config: { coverage: 'au-cities-v1' }, lastSuccessAt: null }, 24 * 7, now), true)
  assert.equal(sourceIsDue({ key: 'abs_region', status: 'ok', lastCheckedAt: new Date(now - 24 * 3600_000), failCount: 0, config: { coverage: 'au-cities-v1' }, lastSuccessAt: recent }, 24 * 7, now), false)
})

test('an open chunk cursor is due after a failure without waiting out the backoff', () => {
  const now = Date.parse('2026-10-28T16:00:00Z')
  const cursor = newCursor('abs-region-chunks-v1')
  cursor.done = ['asgs-sa2-core-1']
  cursor.hashes = { 'asgs-sa2-core-1': 'abc' }
  const recent = new Date(now - 60_000)
  assert.equal(isOpenImport(cursor), true)
  assert.equal(sourceIsDue({ key: 'abs_region', status: 'failed', lastCheckedAt: recent, failCount: 4, config: { coverage: 'au-cities-v1', import: cursor } }, 24 * 7, now), true)
})

test('unfinished ABS imports run before the daily sources', () => {
  assert.equal(sourceRunRank({ key: 'abs_region', status: 'partial', lastCheckedAt: null, failCount: 0, config: {}, lastSuccessAt: null }), 0)
  assert.equal(sourceRunRank({ key: 'abs_hsi', status: 'ok', lastCheckedAt: null, failCount: 0, config: { coverage: 'au-cities-v1' }, lastSuccessAt: new Date() }), 1)
  assert.ok(IMPORT_BUDGET_MS < 300_000)
  assert.equal(IMPORT_BUDGET_MS, 200_000)
})

test('region and SEIFA chunks cover every state and stay uniquely named', () => {
  const region = absRegionChunks()
  const seifa = absSeifaChunks()
  const ids = [...region, ...seifa].map((c) => c.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const state of ['1', '2', '3', '4', '5', '6', '7', '8']) {
    assert.ok(region.some((c) => c.id === `asgs-sa2-core-${state}`))
    assert.ok(seifa.some((c) => c.id === `seifa-sal-${state}`))
    assert.ok(seifa.some((c) => c.id === `seifa-sa2-${state}`))
  }
  assert.equal(region.some((c) => c.id.startsWith('lga-age')), false)
  assert.ok(region.some((c) => c.dataset === 'asgs' && c.id === 'asgs-higher-core'))
  const sa2 = seifa.filter((c) => c.dataset === 'sa2')
  const sal = seifa.filter((c) => c.dataset === 'sal')
  assert.ok(seifa.indexOf(sa2[sa2.length - 1]) < seifa.indexOf(sal[0]))
})

test('ABS region keeps Melbourne, Brisbane and every LGA state, not only NSW', () => {
  const higher = absRegionChunks().find((c) => c.id === 'asgs-higher-core')!
  const geos = mapChunkRows(higher, [
    row({ MEASURE: 'ERP_P_20', REGIONTYPE: 'GCCSA', ASGS_2021: '1GSYD', TIME_PERIOD: '2024', OBS_VALUE: '1' }),
    row({ MEASURE: 'ERP_P_20', REGIONTYPE: 'GCCSA', ASGS_2021: '2GMEL', TIME_PERIOD: '2024', OBS_VALUE: '2' }),
    row({ MEASURE: 'ERP_P_20', REGIONTYPE: 'GCCSA', ASGS_2021: '3GBRI', TIME_PERIOD: '2024', OBS_VALUE: '3' }),
    row({ MEASURE: 'ERP_P_20', REGIONTYPE: 'GCCSA', ASGS_2021: '5GPER', TIME_PERIOD: '2024', OBS_VALUE: '4' }),
    row({ MEASURE: 'ERP_P_20', REGIONTYPE: 'STE', ASGS_2021: '4', TIME_PERIOD: '2024', OBS_VALUE: '5' }),
    row({ MEASURE: 'ERP_P_20', REGIONTYPE: 'AUS', ASGS_2021: 'AUS', TIME_PERIOD: '2024', OBS_VALUE: '6' }),
  ])
  assert.deepEqual(geos.map((r) => r.geoCode).sort(), ['1GSYD', '2GMEL', '3GBRI', '4', '5GPER', 'AUS'])
  const lga = absRegionChunks().find((c) => c.id === 'lga-core')!
  const councils = mapChunkRows(lga, [
    row({ MEASURE: 'ERP_P_20', LGA_2021: '17200', TIME_PERIOD: '2024', OBS_VALUE: '1' }),
    row({ MEASURE: 'ERP_P_20', LGA_2021: '24600', TIME_PERIOD: '2024', OBS_VALUE: '2' }),
    row({ MEASURE: 'ERP_P_20', LGA_2021: '31000', TIME_PERIOD: '2024', OBS_VALUE: '3' }),
    row({ MEASURE: 'ERP_P_20', LGA_2021: '57080', TIME_PERIOD: '2024', OBS_VALUE: '4' }),
  ])
  assert.deepEqual(councils.map((r) => r.geoCode).sort(), ['17200', '24600', '31000', '57080'])
  assert.equal(absRegionChunks().some((c) => c.stateDigit === '2' && c.geoTypes?.includes('SA2')), true)
})

test('ASGS mapping keeps state rows, drops Other Territories, and keeps one age year', () => {
  const chunk = absRegionChunks().find((c) => c.id === 'asgs-sa2-ageA-2')!
  const rows = mapChunkRows(chunk, [
    row({ MEASURE: 'ERP_P_21', REGIONTYPE: 'SA2', ASGS_2021: '206011105', TIME_PERIOD: '2023', OBS_VALUE: '1' }),
    row({ MEASURE: 'ERP_P_21', REGIONTYPE: 'SA2', ASGS_2021: '206011105', TIME_PERIOD: '2024', OBS_VALUE: '2' }),
    row({ MEASURE: 'ERP_P_21', REGIONTYPE: 'SA2', ASGS_2021: '101021007', TIME_PERIOD: '2024', OBS_VALUE: '9' }),
    row({ MEASURE: 'ERP_P_21', REGIONTYPE: 'SA2', ASGS_2021: '901011001', TIME_PERIOD: '2024', OBS_VALUE: '8' }),
    row({ MEASURE: 'NOPE', REGIONTYPE: 'SA2', ASGS_2021: '206011105', TIME_PERIOD: '2024', OBS_VALUE: '3' }),
  ])
  assert.deepEqual(rows.map((r) => [r.geoCode, r.period, r.value]), [['206011105', '2024', 2]])
})

test('SEIFA preference is SAL then SA2, and empty SAL deciles fall through', async () => {
  assert.deepEqual([...SEIFA_PREFERENCE], ['SAL', 'SA2'])
  assert.match(INTEL_SOURCES.abs_seifa.limitations, /Preference order: suburb \(SAL\), then SA2/)
  const candidates = seifaCandidates({ sal: '11701', salName: 'Sydney', sa2: '117031644', sa2Name: 'Sydney - Haymarket' })
  assert.deepEqual(candidates.map((c) => c.geo), ['SAL', 'SA2'])
  assert.deepEqual(seifaRowsToIndexes([{ category: 'IER', measure: 'SCORE', value: 1000 }], 'Sydney'), [])
  const picked = await loadSeifaIndexes(candidates, async (area) => {
    if (area.geo === 'SAL') return []
    return [{ category: 'IER', measure: 'RWSD', value: 9 }, { category: 'IER', measure: 'RWAD', value: 8 }]
  })
  assert.equal(picked.length, 1)
  assert.equal(picked[0].area, 'Sydney - Haymarket')
  assert.equal(picked[0].index, 'IER')
  assert.equal(picked[0].nswDecile, 9)
  assert.equal(picked[0].ausDecile, 8)
  const salOnly = await loadSeifaIndexes(candidates, async (area) => area.geo === 'SAL' ? [{ category: 'IRSAD', measure: 'RWSD', value: 4 }] : [{ category: 'IRSAD', measure: 'RWSD', value: 1 }])
  assert.equal(salOnly[0].area, 'Sydney')
  assert.equal(salOnly[0].nswDecile, 4)
})

test('chunked import resumes, activates a finished dataset, and refuses a short file', async () => {
  const chunks: AbsChunk[] = [
    { id: 'a1', dataset: 'asgs', flow: 'f', key: 'k', params: 'p', kind: 'asgs', minRows: 1 },
    { id: 'a2', dataset: 'asgs', flow: 'f', key: 'k', params: 'p', kind: 'asgs', minRows: 1 },
    { id: 'b1', dataset: 'lga', flow: 'f', key: 'k', params: 'p', kind: 'lga', minRows: 1 },
  ]
  const store = memoryStore()
  let t = 0
  const fetched: string[] = []
  const obs = (code: string): ObsRow => ({ measure: 'ERP_P_20', geoType: 'SA2', geoCode: code, period: '2024', value: 1 })
  const run = (stored: unknown, resume: boolean, deadline: number) => runChunkPlan({
    plan: 'test-plan', chunks, storedCursor: stored, resume, previousHashes: {}, datasetMin: { asgs: 2, lga: 1 },
    deadline, minSliceMs: 10, now: () => t,
    fetchChunk: async (chunk) => { fetched.push(chunk.id); t += 5; return { rows: [obs(chunk.id)], attempts: 1 } },
    store, onCheckpoint: async () => { t += 30 },
  })
  const first = await run(null, false, 40)
  assert.equal(first.partial, true)
  assert.deepEqual(fetched, ['a1'])
  assert.equal(store.active.has('asgs'), false)
  fetched.length = 0
  t = 0
  const second = await run(first.cursor, true, 10_000)
  assert.equal(second.partial, false)
  assert.deepEqual(fetched, ['a2', 'b1'])
  assert.equal(store.active.get('asgs')?.version, second.cursor.pending)
  assert.equal(store.active.get('lga')?.version, second.cursor.pending)
  assert.ok(store.ops.indexOf('activate:asgs') < store.ops.indexOf('append:lga'))
  await assert.rejects(() => runChunkPlan({
    plan: 'test-plan', chunks: [{ id: 'short', dataset: 'asgs', flow: 'f', key: 'k', params: 'p', kind: 'asgs', minRows: 5 }],
    storedCursor: null, resume: false, previousHashes: {}, datasetMin: { asgs: 1 }, deadline: 10_000, minSliceMs: 0, now: () => 0,
    fetchChunk: async () => ({ rows: [obs('x')], attempts: 1 }), store, onCheckpoint: async () => {},
  }), /too few rows \(1\)/)
  assert.match(chunkProgressMessage(4, 48, ['asgs']), /4 of 48 chunks saved/)
})

test('an unchanged dataset does not replace the live version', async () => {
  const chunks: AbsChunk[] = [{ id: 'a', dataset: 'asgs', flow: 'f', key: 'k', params: 'p', kind: 'asgs', minRows: 1 }]
  const store = memoryStore()
  const rows: ObsRow[] = [{ measure: 'ERP_P_20', geoType: 'SA2', geoCode: '101021007', period: '2024', value: 3 }]
  const opts = { plan: 'p', chunks, datasetMin: { asgs: 1 }, deadline: 10_000, minSliceMs: 0, now: () => 0, fetchChunk: async () => ({ rows, attempts: 1 }), store, onCheckpoint: async () => {} }
  const first = await runChunkPlan({ ...opts, storedCursor: null, resume: false, previousHashes: {} })
  const version = store.active.get('asgs')?.version
  const second = await runChunkPlan({ ...opts, storedCursor: null, resume: false, previousHashes: { asgs: first.cursor.datasetHashes.asgs } })
  assert.equal(second.changed, false)
  assert.equal(second.partial, false)
  assert.equal(store.active.get('asgs')?.version, version)
  assert.ok(store.ops.includes('discard:asgs'))
})

function row(partial: Record<string, string>): Record<string, string> {
  return { TIME_PERIOD: '', OBS_VALUE: '', UNIT_MEASURE: '', UNIT_MULT: '', OBS_STATUS: '', ...partial }
}

function memoryStore() {
  const active = new Map<string, { version: string }>()
  const ops: string[] = []
  return {
    active, ops,
    async append(dataset: string) { ops.push(`append:${dataset}`) },
    async activate(dataset: string, version: string) { ops.push(`activate:${dataset}`); active.set(dataset, { version }) },
    async discard(dataset: string) { ops.push(`discard:${dataset}`) },
    async activeVersion(dataset: string) { return active.get(dataset)?.version ?? null },
  }
}
