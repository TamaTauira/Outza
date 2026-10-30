import { NextResponse } from 'next/server'
import { updateManagedListing } from '@/lib/community'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = String(body?.token ?? '')
    if (!token) return NextResponse.json({ error: 'Missing manage link.' }, { status: 400 })
    const result = await updateManagedListing(token, body)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error('community manage failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not update that listing.' }, { status: 500 })
  }
}
