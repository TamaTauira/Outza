import { NextResponse } from 'next/server'
import { actor, createPlan, listMyPlans } from '@/lib/together-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const who = await actor()
  const plans = await listMyPlans(who)
  return NextResponse.json({
    plans: plans.map((plan) => ({
      token: plan.token,
      name: plan.name,
      city: plan.city,
      planDate: plan.planDate ? plan.planDate.toISOString().slice(0, 10) : null,
      items: plan._count.items,
      votes: plan._count.votes,
    })),
  })
}

export async function POST(req: Request) {
  const who = await actor()
  const body = await req.json().catch(() => ({}))
  const result = await createPlan(who, body)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
