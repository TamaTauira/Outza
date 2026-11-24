import { prisma } from '@/lib/db'
import { EMAIL_C, emailBodyCell } from '@/lib/email-brand'
import { escapeHtml } from '@/lib/email'

export type MonthlyOpsLine = { label: string; value: string }

/**
 * Section for the monthly summary. The ideas email itself is owned by the other run.
 * Spend and storage are only filled from env so this never invents a number.
 */
export async function monthlyOpsSection(now = new Date()): Promise<{ title: string; lines: MonthlyOpsLine[]; html: string }> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [decisions, undos, faults, completed, failed] = await Promise.all([
    prisma.opsDecision.count({ where: { createdAt: { gte: start }, actor: { in: ['bot:rules', 'bot:ai'] }, action: { notIn: ['digest', 'undo'] } } }).catch(() => 0),
    prisma.opsDecision.count({ where: { undoneAt: { gte: start } } }).catch(() => 0),
    prisma.ownerAlert.count({ where: { kind: 'FAULT', lastSeen: { gte: start } } }).catch(() => 0),
    prisma.refreshLog.count({ where: { status: 'completed', startedAt: { gte: start } } }).catch(() => 0),
    prisma.refreshLog.count({ where: { status: 'failed', startedAt: { gte: start } } }).catch(() => 0),
  ])
  const runs = completed + failed
  const spend = process.env.AI_GATEWAY_SPEND_USD?.trim()
  const storage = process.env.NEON_STORAGE_BYTES?.trim()
  const lines: MonthlyOpsLine[] = [
    { label: 'Refresh runs completed', value: runs ? `${completed} of ${runs}` : 'No refresh runs recorded' },
    { label: 'Faults seen', value: String(faults) },
    { label: 'Bot decisions', value: String(decisions) },
    { label: 'Undone', value: String(undos) },
    { label: 'AI Gateway spend', value: spend ? `USD ${spend}` : 'Not recorded in the app. Check the AI Gateway dashboard.' },
    { label: 'Neon storage', value: storage ? `${storage} bytes` : 'Not recorded in the app. Check the Neon console.' },
  ]
  const html = emailBodyCell(`<h2 style="margin:16px 0 8px;font-size:20px;color:${EMAIL_C.ink};">Operations this month</h2>
    ${lines.map((line) => `<p style="margin:0 0 6px;"><strong>${escapeHtml(line.label)}:</strong> ${escapeHtml(line.value)}</p>`).join('')}`)
  return { title: 'Operations this month', lines, html }
}
