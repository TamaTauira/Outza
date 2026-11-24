import { UNDO_WINDOW_MS, type Snapshot } from '@/lib/ops/types'

export function undoAllowed(createdAt: Date, undoneAt: Date | null, now = new Date()): { ok: true } | { ok: false; reason: string } {
  if (undoneAt) return { ok: false, reason: 'Already undone.' }
  if (now.getTime() - createdAt.getTime() > UNDO_WINDOW_MS) return { ok: false, reason: 'The 30-day undo window has closed.' }
  return { ok: true }
}

export function snapshotOf(value: unknown): Snapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Snapshot
}
