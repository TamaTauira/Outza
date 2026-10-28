import { prisma } from './lib/prisma'
import { assetIdFor, bestSourceUrl } from './lib/images/source-url'
import { processAsset } from './lib/images/pipeline'

const only = process.argv[2] // optional event id
;(async () => {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const rows = await prisma.event.findMany({
    where: only ? { id: only } : { date: { gte: today }, duplicateOfId: null, imageUrl: { not: null } },
    select: { id: true, imageUrl: true, imageAssetId: true, date: true }, orderBy: { date: 'asc' },
  })
  const order: string[] = []
  const byUrl = new Map<string, string[]>()
  for (const r of rows) {
    const src = bestSourceUrl(r.imageUrl); if (!src) continue
    if (!byUrl.has(src)) { byUrl.set(src, []); order.push(src) }
    byUrl.get(src)!.push(r.id)
  }
  const entries = [...byUrl.entries()]
  for (let i = 0; i < entries.length; i += 200) {
    await prisma.imageAsset.createMany({ data: entries.slice(i, i + 200).map(([s]) => ({ id: assetIdFor(s), sourceUrl: s })), skipDuplicates: true })
  }
  for (const [src, ids] of entries) {
    await prisma.event.updateMany({ where: { id: { in: ids }, imageLocked: false }, data: { imageAssetId: assetIdFor(src), imageUrl: src } })
  }
  console.log(`linked ${rows.length} events -> ${order.length} images`)
  const done = new Set((await prisma.imageAsset.findMany({ where: { processedAt: { gte: new Date(process.env.SINCE ?? '2026-10-24T22:00:00Z') } }, select: { id: true } })).map((a) => a.id))
  const ids = order.map(assetIdFor).filter((id) => !done.has(id))
  const counts: Record<string, number> = {}
  let next = 0, n = 0
  const t0 = Date.now()
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++]
      const r = await processAsset(id, { force: true }).catch((e: any) => ({ outcome: 'failed', note: e?.message }))
      counts[r.outcome] = (counts[r.outcome] ?? 0) + 1
      if (++n % 25 === 0 || only) console.log(n, '/', ids.length, `${Math.round((Date.now() - t0) / n)}ms/img`, JSON.stringify(counts), r.note ?? '')
    }
  }
  await Promise.all(Array.from({ length: Number(process.env.CONC ?? 3) }, worker))
  console.log('DONE', JSON.stringify(counts))
  await prisma.$disconnect()
})()
