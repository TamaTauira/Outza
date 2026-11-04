import { NextResponse } from 'next/server'
import { requestPasswordReset } from '@/lib/account-flow'
import { GENERIC_RESET_MESSAGE } from '@/lib/account-trust'

export const dynamic = 'force-dynamic'

/** Always the same response, whether or not the email has an account. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email ?? '')
  try {
    const result = await requestPasswordReset(email)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[account] forgot-password', err instanceof Error ? err.message : err)
    return NextResponse.json({ message: GENERIC_RESET_MESSAGE })
  }
}
