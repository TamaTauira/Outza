import { prisma } from '@/lib/db'
import { approveClaim } from '@/lib/trust'
import { duplicatePrimaryId, queueDecision, reportListingEffect, type QueueAction, type QueueKind } from '@/lib/trust-queue'

async function audit(eventId: string | null, action: QueueAction, detail: string) {
  await prisma.qualityAudit.create({
    data: { eventId, action: action === 'approve' ? 'ADMIN_APPROVED' : 'ADMIN_DISMISSED', detail, status: null },
  })
}

async function applyOne(kind: QueueKind, id: string, action: QueueAction) {
  const decision = queueDecision(kind, action)
  if (kind === 'report') {
    const report = await prisma.eventReport.findUnique({ where: { id }, select: { id: true, status: true, reason: true, eventId: true, event: { select: { title: true } } } })
    if (!report || report.status !== 'OPEN') return false
    await prisma.eventReport.update({ where: { id }, data: { status: decision.status, resolvedAt: new Date() } })
    if (reportListingEffect(report.reason, action) === 'cancel') {
      await prisma.event.update({ where: { id: report.eventId }, data: { status: 'CANCELLED', statusSource: 'report' } })
    }
    await audit(report.eventId, action, `${decision.status} report ${report.reason} on ${report.event.title}`)
    return true
  }
  if (kind === 'claim') {
    const claim = await prisma.eventClaim.findUnique({ where: { id }, select: { id: true, status: true, eventId: true } })
    if (!claim || claim.status !== 'PENDING') return false
    if (action === 'approve') {
      const approved = await approveClaim(id, 'Verified by an admin')
      if (!approved) return false
    } else {
      await prisma.eventClaim.update({ where: { id }, data: { status: 'REJECTED', reviewedAt: new Date(), reviewNote: 'Dismissed by an admin' } })
    }
    await audit(claim.eventId, action, `${decision.status} organiser claim ${id}`)
    return true
  }
  const flag = await prisma.qualityAudit.findUnique({ where: { id }, select: { id: true, status: true, action: true, detail: true, eventId: true } })
  if (!flag || flag.status !== 'OPEN') return false
  if (action === 'approve' && flag.action === 'DUPLICATE_FLAGGED' && flag.eventId) {
    const primary = duplicatePrimaryId(flag.detail)
    if (primary && primary !== flag.eventId) {
      const kept = await prisma.event.findUnique({ where: { id: primary }, select: { id: true, duplicateOfId: true } })
      if (kept && kept.duplicateOfId !== flag.eventId) {
        await prisma.event.update({ where: { id: flag.eventId }, data: { duplicateOfId: primary } })
      }
    }
  }
  await prisma.qualityAudit.update({ where: { id }, data: { status: decision.status, reviewedAt: new Date() } })
  await audit(flag.eventId, action, `${decision.status} quality flag ${flag.action}${flag.detail ? `: ${flag.detail.slice(0, 240)}` : ''}`)
  return true
}

export async function applyTrustItems(items: { kind: QueueKind; id: string }[], action: QueueAction) {
  let done = 0
  const skipped: string[] = []
  for (const item of items) {
    try {
      const ok = await applyOne(item.kind, item.id, action)
      if (ok) done++
      else skipped.push(`${item.kind}:${item.id}`)
    } catch (err) {
      console.error('Trust review failed:', err)
      skipped.push(`${item.kind}:${item.id}`)
    }
  }
  return { done, skipped }
}
