import { NextResponse } from 'next/server'
import { loadManagedListing, templatesForEmail } from '@/lib/community'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Templates for the signed-in email, or for the email on a valid manage link. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const me = await getSessionUser().catch(() => null)
  const managed = token ? await loadManagedListing(token).catch(() => null) : null
  const email = managed?.contactEmail || me?.email || ''
  if (!email) return NextResponse.json({ templates: [] })
  const templates = await templatesForEmail(email).catch(() => [])
  return NextResponse.json({ templates })
}
