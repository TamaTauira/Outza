import { NextResponse } from 'next/server'
import { CATALOGUE_IDS, catalogueEntry, renderTemplate, type TemplateId } from '@/lib/email-catalogue'
import { sampleWatchEmail } from '@/lib/email-preview'

export const dynamic = 'force-dynamic'

const headers = {
  'x-robots-tag': 'noindex',
  'cache-control': 'no-store',
}

function page(body: string, contentType: string) {
  return new NextResponse(body, { status: 200, headers: { ...headers, 'content-type': contentType } })
}

/** Sample mail only. Nothing is sent and no account is read. */
export function GET(req: Request) {
  const url = new URL(req.url)
  const text = url.searchParams.get('format') === 'text'
  if (url.searchParams.get('index') === '1') {
    const items = CATALOGUE_IDS.map((id) => {
      const entry = catalogueEntry(id)
      const name = entry?.name ?? id
      return `<li><a href="?id=${id}">${id} · ${name}</a></li>`
    }).join('')
    return page(`<!DOCTYPE html><html lang="en-AU"><head><meta charset="utf-8"/><title>VibePeep email previews</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;"><h1>Email previews</h1><p>Sample data only. Nothing is sent.</p><ul>${items}</ul></body></html>`, 'text/html; charset=utf-8')
  }
  const id = url.searchParams.get('id')
  if (id) {
    if (!CATALOGUE_IDS.includes(id as TemplateId)) {
      return new NextResponse('Unknown email', { status: 404, headers })
    }
    const mail = renderTemplate(id as TemplateId)
    return page(text ? mail.text : mail.html, text ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8')
  }
  const mail = sampleWatchEmail()
  return page(text ? mail.text : mail.html, text ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8')
}
