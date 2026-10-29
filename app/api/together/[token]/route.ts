import { NextResponse } from 'next/server'
import { validToken } from '@/lib/together'
import { actor, loadPlan } from '@/lib/together-server'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!validToken(token)) return NextResponse.json({ error: 'That invite link does not look right' }, { status: 400 })
  const plan = await loadPlan(token, await actor())
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  return NextResponse.json({ plan })
}
