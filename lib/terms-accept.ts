import { prisma } from '@/lib/db'
import { missingTable } from '@/lib/sponsorship-store'
import {
  checkoutTermsError,
  missingAcceptance,
  promoterAcceptance,
  requiredAcceptance,
  type AcceptanceNeed,
} from '@/lib/legal-docs'

export async function recordAcceptance(userId: string, docs: AcceptanceNeed[], context: string) {
  if (!docs.length) return
  const have = await prisma.termsAcceptance.findMany({ where: { userId }, select: { doc: true, version: true } })
  const missing = missingAcceptance(have, docs)
  if (!missing.length) return
  await prisma.termsAcceptance.createMany({
    data: missing.map((doc) => ({ userId, doc: doc.doc, version: doc.version, context })),
  })
}

export async function outstandingFor(userId: string, role: string | null | undefined) {
  const have = await prisma.termsAcceptance.findMany({ where: { userId }, select: { doc: true, version: true } })
  return missingAcceptance(have, requiredAcceptance(role))
}

/** Every paid promoter action must send agreePromoterTerms: true. Records the current version if it is not stored yet. */
export async function enforcePromoterCheckout(userId: string, agree: unknown): Promise<{ error: string; status: number } | null> {
  const tick = checkoutTermsError(agree)
  if (tick) return { error: tick, status: 403 }
  try {
    await recordAcceptance(userId, [promoterAcceptance()], 'checkout')
    return null
  } catch (error) {
    if (missingTable(error)) {
      return { error: 'Promoter terms cannot be recorded until the terms update is applied.', status: 503 }
    }
    throw error
  }
}
