import { NextRequest, NextResponse } from 'next/server'
import { resolveEdgeLocation } from '@/lib/edge-location'

export const dynamic = 'force-dynamic'

/**
 * Board default from the edge IP headers, when they resolve to a place we
 * list: a catalogue city, plus the region area on a region board (a Newcastle
 * IP gets the Sydney board narrowed to Newcastle & the Hunter). Never invents
 * one — unresolvable, non-Australian or header-less requests get nulls and
 * the client keeps its current default.
 */
export async function GET(request: NextRequest) {
  const location = resolveEdgeLocation({
    city: request.headers.get('x-vercel-ip-city'),
    country: request.headers.get('x-vercel-ip-country'),
    latitude: request.headers.get('x-vercel-ip-latitude'),
    longitude: request.headers.get('x-vercel-ip-longitude'),
  })
  return NextResponse.json({ city: location?.city ?? null, area: location?.area ?? null })
}
