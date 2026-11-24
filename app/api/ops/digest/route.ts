import { Prisma } from '@prisma/client'
import { applyOpsAction, type ApplyInput } from '@/lib/ops/apply'
import { decide } from '@/lib/ops/decide'
import { consumeDigestLink, digestResultPage } from '@/lib/ops/digest-link'
import { prismaDigestStore } from '@/lib/ops/digest-store'
import { ensureOpsTables } from '@/lib/ops/ensure'

export const dynamic = 'force-dynamic'

function text(result: Parameters<typeof digestResultPage>[0], status = 200) {
  return new Response(digestResultPage(result), { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

/** One-click approve or decline from the weekly email. Each link works once. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  if (!token) return text({ status: 'invalid' }, 400)
  try {
    await ensureOpsTables()
  } catch {
    return text({ status: 'invalid' }, 500)
  }
  const result = await consumeDigestLink({
    token,
    store: prismaDigestStore(),
    apply: async (item, action) => {
      const payload = item.payload ?? {}
      const name = String(action === 'approve' ? payload.approveAction : payload.declineAction)
      const input: ApplyInput = {
        action: name,
        auditId: typeof payload.auditId === 'string' ? payload.auditId : null,
        eventId: typeof payload.eventId === 'string' ? payload.eventId : null,
        reportId: typeof payload.reportId === 'string' ? payload.reportId : null,
        claimId: typeof payload.claimId === 'string' ? payload.claimId : null,
        claimKind: payload.claimKind === 'venue' || payload.claimKind === 'event' ? payload.claimKind : null,
        venueId: typeof payload.venueId === 'string' ? payload.venueId : null,
        changeId: typeof payload.changeId === 'string' ? payload.changeId : null,
        field: typeof payload.field === 'string' ? payload.field : null,
        value: typeof payload.value === 'string' ? payload.value : null,
        primaryId: typeof payload.primaryId === 'string' ? payload.primaryId : null,
        email: typeof payload.email === 'string' ? payload.email : null,
        patch: payload.patch && typeof payload.patch === 'object' ? payload.patch as Record<string, unknown> : null,
      }
      const applied = await applyOpsAction(input)
      await decide({
        kind: 'DIGEST',
        targetType: typeof payload.targetType === 'string' ? payload.targetType : 'digest',
        targetId: item.id,
        action,
        reason: item.summary,
        confidence: 1,
        actor: 'owner-digest',
        before: applied.before as Prisma.InputJsonValue,
        after: applied.after as Prisma.InputJsonValue,
      })
    },
  })
  const status = result.status === 'applied' ? 200 : result.status === 'used' ? 409 : 400
  return text(result, status)
}
