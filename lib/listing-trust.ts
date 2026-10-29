import { prisma } from '@/lib/db'
import { outzaVerified, VERIFIED_BLOCKING_REPORTS, type VerifiedInput } from '@/lib/quality'

/** Looks up open blocking reports and applies the Outza Verified standard. Missing report data never counts as verified. */
export async function verifiedFlags<T extends VerifiedInput & { id: string }>(events: T[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>()
  if (!events.length) return out
  const reports = await prisma.eventReport.findMany({
    where: {
      eventId: { in: events.map((e) => e.id) },
      status: 'OPEN',
      reason: { in: [...VERIFIED_BLOCKING_REPORTS] },
    },
    select: { eventId: true, reason: true },
  })
  const byEvent = new Map<string, string[]>()
  for (const row of reports) byEvent.set(row.eventId, [...(byEvent.get(row.eventId) ?? []), row.reason])
  for (const ev of events) {
    out.set(ev.id, outzaVerified({ ...ev, openReportReasons: byEvent.get(ev.id) ?? [] }).ok)
  }
  return out
}
