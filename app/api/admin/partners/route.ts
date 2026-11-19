import { NextResponse } from 'next/server'
import { forbidden, getSessionUser, unauthorized } from '@/lib/session'
import { listPartnerAccounts } from '@/lib/partner-data'
import { generatePartnerPassword, parsePartnerSources, savePartnerAccount } from '@/lib/partner-admin'

export const dynamic = 'force-dynamic'

async function admin() {
  const me = await getSessionUser()
  if (!me) return { error: unauthorized() }
  if (me.role !== 'ADMIN') return { error: forbidden() }
  return { me }
}

export async function GET() {
  const gate = await admin()
  if ('error' in gate) return gate.error
  return NextResponse.json({ partners: await listPartnerAccounts() })
}

export async function POST(req: Request) {
  const gate = await admin()
  if ('error' in gate) return gate.error
  const body = await req.json().catch(() => null) as {
    email?: unknown
    name?: unknown
    displayName?: unknown
    password?: unknown
    generatePassword?: unknown
    sources?: unknown
  } | null
  const parsed = parsePartnerSources(body?.sources)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const generated = body?.generatePassword === true ? generatePartnerPassword() : ''
  const password = generated || (typeof body?.password === 'string' ? body.password : '')
  const saved = await savePartnerAccount({
    email: String(body?.email ?? ''),
    name: String(body?.name ?? ''),
    displayName: String(body?.displayName ?? ''),
    password,
    sources: parsed.sources,
  })
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status })
  return NextResponse.json({
    ok: true,
    created: saved.created,
    email: saved.email,
    password: generated || null,
  })
}
