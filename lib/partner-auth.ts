import { prisma } from '@/lib/db'
import { forbidden, getSessionUser, unauthorized } from '@/lib/session'
import type { PartnerSourceScope } from '@/lib/partner-scope'
import { PARTNER_ROLE } from '@/lib/partner-scope'

export type PartnerContext = {
  userId: string
  email: string
  displayName: string
  scope: PartnerSourceScope[]
}

export async function requirePartner(): Promise<{ partner: PartnerContext } | { error: Response }> {
  const me = await getSessionUser()
  if (!me) return { error: unauthorized() }
  if (me.role !== PARTNER_ROLE) return { error: forbidden() }
  const account = await prisma.partnerAccount.findUnique({
    where: { userId: me.id },
    include: { sources: { orderBy: { sourceKey: 'asc' } } },
  })
  return {
    partner: {
      userId: me.id,
      email: me.email,
      displayName: account?.displayName || me.name || 'Source partner',
      scope: (account?.sources ?? []).map((row) => ({ sourceKey: row.sourceKey, hostPatterns: row.hostPatterns })),
    },
  }
}
