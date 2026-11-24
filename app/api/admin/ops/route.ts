import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized, forbidden } from '@/lib/session'
import { loadOpsPage } from '@/lib/ops/admin-data'
import { saveRuleConfig, undoDecision } from '@/lib/ops/decide'
import { RULE_KEYS } from '@/lib/ops/types'

export const dynamic = 'force-dynamic'

async function admin() {
  const me = await getSessionUser()
  if (!me) return { error: unauthorized() }
  if (me.role !== 'ADMIN') return { error: forbidden() }
  return { me }
}

export async function GET() {
  const a = await admin()
  if (a.error) return a.error
  return NextResponse.json(await loadOpsPage())
}

export async function POST(req: Request) {
  const a = await admin()
  if (a.error) return a.error
  const body = await req.json().catch(() => ({}))
  if (body.action === 'undo' && typeof body.id === 'string') {
    const result = await undoDecision(body.id, `admin:${a.me.id}`)
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 })
    return NextResponse.json({ ok: true, page: await loadOpsPage() })
  }
  if (body.action === 'settings') {
    const key = typeof body.key === 'string' ? body.key : ''
    if (key === 'thresholds' && body.thresholds && typeof body.thresholds === 'object') {
      await saveRuleConfig({ key: 'thresholds', thresholds: body.thresholds })
    } else if ((RULE_KEYS as readonly string[]).includes(key) && typeof body.enabled === 'boolean') {
      await saveRuleConfig({ key, enabled: body.enabled })
    } else {
      return NextResponse.json({ error: 'Choose a rule or a threshold.' }, { status: 400 })
    }
    return NextResponse.json({ ok: true, page: await loadOpsPage() })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
