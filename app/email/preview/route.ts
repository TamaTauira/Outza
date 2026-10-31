import { NextResponse } from 'next/server'
import { sampleWatchEmail } from '@/lib/email-preview'

export const dynamic = 'force-dynamic'

/** Renders the watchlist digest with sample data. Nothing is sent and no account is read. */
export function GET(req: Request) {
  const mail = sampleWatchEmail()
  const text = new URL(req.url).searchParams.get('format') === 'text'
  const body = text ? mail.text : mail.html
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': text ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex',
      'cache-control': 'no-store',
    },
  })
}
