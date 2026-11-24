import { prisma } from '@/lib/db'
import type { DigestStore, StoredDigestItem, StoredToken } from '@/lib/ops/digest-link'
import type { DigestAction } from '@/lib/ops/tokens'

function payloadOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function prismaDigestStore(): DigestStore {
  return {
    async findToken(hash: string): Promise<StoredToken | null> {
      const row = await prisma.opsDigestToken.findUnique({ where: { tokenHash: hash } })
      if (!row) return null
      return { ...row, action: row.action as DigestAction }
    },
    async findItem(id: string): Promise<StoredDigestItem | null> {
      const row = await prisma.opsDigestItem.findUnique({ where: { id } })
      if (!row) return null
      return { id: row.id, status: row.status, summary: row.summary, payload: payloadOf(row.payload) }
    },
    async claimToken(id: string, at: Date): Promise<boolean> {
      const result = await prisma.opsDigestToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: at } })
      return result.count === 1
    },
    async releaseToken(id: string): Promise<void> {
      await prisma.opsDigestToken.update({ where: { id }, data: { usedAt: null } })
    },
    async markItemTokensUsed(itemId: string, at: Date): Promise<void> {
      await prisma.opsDigestToken.updateMany({ where: { itemId, usedAt: null }, data: { usedAt: at } })
    },
    async resolveItem(id: string, status: 'APPROVED' | 'DECLINED', at: Date): Promise<void> {
      await prisma.opsDigestItem.update({ where: { id }, data: { status, resolvedAt: at } })
    },
  }
}
