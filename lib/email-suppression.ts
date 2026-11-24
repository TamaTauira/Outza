import { configuredTestInbox } from '@/lib/email-test-inbox'

/** True when a bounce or complaint has suppressed this address. Missing table fails open. */
export async function emailSuppressed(to: string): Promise<boolean> {
  const email = to.trim().toLowerCase()
  if (!email) return false
  const inbox = configuredTestInbox()
  if (inbox && email === inbox) return false
  if (!process.env.DATABASE_URL) return false
  try {
    const { prisma } = await import('@/lib/db')
    const row = await prisma.emailSuppression.findUnique({ where: { email }, select: { email: true } })
    return !!row
  } catch (err) {
    console.error('[email] suppression lookup skipped', err instanceof Error ? err.message : err)
    return false
  }
}
