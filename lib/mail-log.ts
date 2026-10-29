import { prisma } from '@/lib/db'
import { redactEmails } from '@/lib/email'

/** Stores one delivery or cron-run outcome. Failures here must not stop the send. */
export async function recordMailDelivery(row: {
  kind: string
  userId?: string | null
  status: string
  error?: string | null
}) {
  const error = row.error ? redactEmails(row.error).slice(0, 500) : null
  try {
    await prisma.mailDelivery.create({
      data: { kind: row.kind, userId: row.userId || null, status: row.status, error },
    })
  } catch (err) {
    console.error('[email] could not record delivery', err instanceof Error ? err.message : err)
  }
}
