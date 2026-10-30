import { prisma } from '@/lib/prisma'
import { classifyReferral, type ReferralSource } from '@/lib/referrals'
import { siteUrl } from '@/lib/site-url'
import { landingAttrFromCookies } from '@/lib/landing-attribution'

const FIELD = { view: 'views', detail: 'detailViews', save: 'saves', lead: 'leads' } as const
export type LandingHitKind = keyof typeof FIELD

function ownHost(): string | null {
  try { return new URL(siteUrl()).host } catch { return null }
}

export function classifyLandingReferrer(referrer: unknown, utm: { source?: unknown; medium?: unknown } = {}): ReferralSource {
  const ref = typeof referrer === 'string' && referrer.length > 0 && referrer.length <= 500 ? referrer : null
  const source = typeof utm.source === 'string' ? utm.source.slice(0, 80) : undefined
  const medium = typeof utm.medium === 'string' ? utm.medium.slice(0, 80) : undefined
  return classifyReferral(ref, ownHost(), { source, medium })
}

/** Best-effort counter. A missing table or a blip must not break the page that asked. */
export async function recordLandingHit(path: string, source: ReferralSource, kind: LandingHitKind): Promise<void> {
  const field = FIELD[kind]
  try {
    await prisma.landingStat.upsert({
      where: { path_source: { path, source } },
      create: { path, source, [field]: 1 },
      update: { [field]: { increment: 1 } },
    })
  } catch (err) {
    console.error('landing stat failed', err)
  }
}

export async function recordLandingFromCookieJar(
  get: (name: string) => string | undefined,
  kind: 'save' | 'lead',
): Promise<void> {
  const attr = landingAttrFromCookies(get('vp_src'), get('vp_lp'))
  if (!attr) return
  await recordLandingHit(attr.path, attr.source, kind)
}
