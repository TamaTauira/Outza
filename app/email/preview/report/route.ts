import { NextResponse } from 'next/server'
import { emailBodyCell, emailDocument } from '@/lib/email-brand'
import { recapFragment } from '@/lib/organiser-reach'
import { siteUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

/** Sample weekly recap. Nothing is sent and no account is read. */
export function GET(req: Request) {
  const recap = recapFragment({
    opened: 128,
    ticket: 14,
    saves: 22,
    reactions: 17,
    tip: 'Your crowd peeks around 7pm. That’s a sharp time to post or boost.',
    benchmark: 'Your Get tickets clicks are 2× the average for Comedy in Newtown (in this range).',
    unsubUrl: `${siteUrl()}/unsubscribe/report?u=sample&k=preview`,
  })
  const html = emailDocument({
    title: 'Your VibePeep week, in one note',
    preheader: 'How your listings are tracking on VibePeep.',
    manageHref: `${siteUrl()}/promoter`,
    homeHref: siteUrl(),
    reason: 'Sample only. A real recap uses the unsubscribe link to turn weekly reports off.',
    rows: emailBodyCell(`<h1 style="font-size:20px;margin:0 0 8px">Your week on VibePeep</h1><p style="font-size:14px;margin:0 0 8px">Hi there, here’s a sample of the weekly recap. No account was read to draw this.</p>${recap.html}`),
  })
  const text = new URL(req.url).searchParams.get('format') === 'text'
  return new NextResponse(text ? recap.text : html, {
    headers: {
      'content-type': text ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex',
      'cache-control': 'no-store',
    },
  })
}
