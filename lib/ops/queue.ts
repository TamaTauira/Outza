import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ensureOpsTables } from '@/lib/ops/ensure'

export async function markDigestItem(targetType: string, targetId: string, status: 'HANDLED' | 'OPEN' | 'QUEUED'): Promise<void> {
  await ensureOpsTables()
  await prisma.opsDigestItem.updateMany({
    where: { targetType, targetId, status: { in: ['QUEUED', 'OPEN'] } },
    data: { status, resolvedAt: status === 'HANDLED' ? new Date() : null },
  })
}

export async function upsertDigestItem(input: {
  kind: string
  targetType: string
  targetId: string
  summary: string
  confidence: number
  status: 'QUEUED' | 'OPEN' | 'HANDLED' | 'APPROVED' | 'DECLINED'
  payload?: Prisma.InputJsonValue
}): Promise<void> {
  await ensureOpsTables()
  const open = await prisma.opsDigestItem.findFirst({
    where: { targetType: input.targetType, targetId: input.targetId, status: { in: ['QUEUED', 'OPEN'] } },
    select: { id: true },
  })
  const data = {
    kind: input.kind.slice(0, 80),
    summary: input.summary.slice(0, 2000),
    confidence: input.confidence,
    status: input.status,
    payload: input.payload,
    resolvedAt: input.status === 'QUEUED' || input.status === 'OPEN' ? null : new Date(),
  }
  if (open) {
    await prisma.opsDigestItem.update({ where: { id: open.id }, data })
    return
  }
  try {
    await prisma.opsDigestItem.create({
      data: { ...data, targetType: input.targetType.slice(0, 80), targetId: input.targetId.slice(0, 80) },
    })
  } catch (err) {
    if ((err as { code?: string }).code !== 'P2002') throw err
  }
}

/** Replaces a one-by-one trust email. Disputes and payments still email separately. */
export async function queueTrustItem(input: {
  kind: string
  targetType: string
  targetId: string
  summary: string
}): Promise<void> {
  try {
    await upsertDigestItem({ ...input, confidence: 0, status: 'QUEUED' })
  } catch (err) {
    console.error('[ops] queue write failed', err instanceof Error ? err.message : err)
  }
}
