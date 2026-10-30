import { NextResponse } from 'next/server'
import { resendCommunityCode, verifyCommunity } from '@/lib/community'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    if (body?.resend && body.eventId) {
      const result = await resendCommunityCode(String(body.eventId))
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json(result)
    }
    const result = await verifyCommunity({ eventId: body?.eventId, code: body?.code, token: body?.token })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error('community verify failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not confirm that code.' }, { status: 500 })
  }
}
