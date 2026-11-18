import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { missingTable } from '@/lib/sponsorship-store'
import { outstandingFor } from '@/lib/terms-accept'
import { LEGAL_DOCS } from '@/lib/legal-docs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ signedIn: false, missing: [] })
  try {
    const missing = await outstandingFor(me.id, me.role)
    return NextResponse.json({
      signedIn: true,
      role: me.role,
      missing: missing.map((item) => ({ ...item, title: LEGAL_DOCS[item.doc].title, path: LEGAL_DOCS[item.doc].path })),
    })
  } catch (error) {
    if (missingTable(error)) return NextResponse.json({ signedIn: true, missing: [], pendingMigration: true })
    throw error
  }
}
