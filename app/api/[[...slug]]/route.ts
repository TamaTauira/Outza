import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Unknown /api paths must be an API 404, not the city catch-all HTML page. */
function miss() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export const GET = miss
export const POST = miss
export const PUT = miss
export const PATCH = miss
export const DELETE = miss
export const HEAD = miss
