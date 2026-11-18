import { NextRequest, NextResponse } from 'next/server'
import { CITY_NAMES } from '@/lib/cities'

export const dynamic = 'force-dynamic'

/** City from the edge IP header, when it matches a city we list. Never invents one. */
export async function GET(request: NextRequest) {
  const raw = request.headers.get('x-vercel-ip-city')
  const decoded = raw ? decodeURIComponent(raw).trim() : ''
  const city = CITY_NAMES.find((name) => name.toLowerCase() === decoded.toLowerCase()) ?? null
  return NextResponse.json({ city })
}
