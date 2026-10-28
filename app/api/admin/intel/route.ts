import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, forbidden } from '@/lib/session'
import { ensureSources, runSource } from '@/lib/intel/ingest'
import { SOURCE_KEYS, type SourceKey } from '@/lib/intel/sources'

export const dynamic = 'force-dynamic'
// Chunked ABS imports stop around 200s so this limit can save a resume cursor.
export const maxDuration = 300

export async function GET() {
  const me = await getSessionUser()
  if (me?.role !== 'ADMIN') return forbidden()
  await ensureSources()
  const [sources, jobs] = await Promise.all([
    prisma.intelSource.findMany(),
    prisma.intelIngestJob.findMany({ orderBy: { startedAt: 'desc' }, take: 30 }),
  ])
  return NextResponse.json({ sources, jobs })
}

/** Run one source now: { source: 'abs_region' | ... } */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (me?.role !== 'ADMIN') return forbidden()
  const { source } = await req.json().catch(() => ({}))
  if (!SOURCE_KEYS.includes(source)) return NextResponse.json({ error: 'Unknown source' }, { status: 400 })
  await prisma.intelAuditLog.create({ data: { userId: me.id, action: 'run_source', detail: source } }).catch(() => {})
  const r = await runSource(source as SourceKey, 'admin')
  return NextResponse.json(r)
}
