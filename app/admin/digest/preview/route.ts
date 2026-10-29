import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { buildNewsletter } from '@/lib/newsletter'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function page(title: string, message: string, status = 200) {
  const body = `<!DOCTYPE html><html lang="en"><body style="font-family:Helvetica,Arial,sans-serif;padding:40px;background:#f6f2ec;color:#1c1c1e"><h1>${title}</h1><p>${message}</p></body></html>`
  return new NextResponse(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } })
}

/** Renders the signed-in admin's own digest HTML in the browser. Nothing is sent. */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return page('Sign in', 'Sign in as an admin to preview your digest.', 401)
  if (me.role !== 'ADMIN') return page('Admins only', 'This preview uses an admin account.', 403)
  try {
    const built = await buildNewsletter(me.id, { mode: 'preview' })
    if ('skip' in built) return page('Nothing to preview', built.skip.replace(/[<>&]/g, ''))
    return new NextResponse(built.html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' },
    })
  } catch (err) {
    console.error('[admin/digest/preview]', err instanceof Error ? err.message : err)
    return page('Preview failed', 'The digest could not be built.', 500)
  }
}
