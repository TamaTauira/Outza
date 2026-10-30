import { NextResponse, type NextRequest } from 'next/server'
import { bareEventId } from '@/lib/event-redirect'

/**
 * 301 bare `/events/<id>` URLs onto `/events/<slug>-<id>`.
 * Slug URLs already contain a hyphen and skip the database.
 * A lookup failure falls through to the event page.
 */
export async function proxy(request: NextRequest) {
  const id = bareEventId(request.nextUrl.pathname)
  if (!id) return NextResponse.next()
  try {
    const { lookupBareEventRedirect } = await import('@/lib/event-redirect-server')
    const target = await lookupBareEventRedirect(id)
    if (!target) return NextResponse.next()
    const url = request.nextUrl.clone()
    url.pathname = target
    return NextResponse.redirect(url, 301)
  } catch (err) {
    console.error('event id redirect failed', err)
    return NextResponse.next()
  }
}

export const config = {
  matcher: ['/events/:id'],
}
