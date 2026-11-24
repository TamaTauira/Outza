import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized, forbidden } from '@/lib/session'
import { renderTemplate, type TemplateId, CATALOGUE_IDS } from '@/lib/email-catalogue'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (me.role !== 'ADMIN') return forbidden()
  const url = new URL(req.url)
  const id = url.searchParams.get('id') || ''
  if (!CATALOGUE_IDS.includes(id as TemplateId)) return NextResponse.json({ error: 'Unknown template' }, { status: 404 })
  const mail = renderTemplate(id as TemplateId)
  const text = url.searchParams.get('format') === 'text'
  return new NextResponse(text ? mail.text : mail.html, {
    headers: {
      'content-type': text ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex, nofollow',
      'cache-control': 'no-store',
    },
  })
}
