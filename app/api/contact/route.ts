import { NextResponse } from 'next/server'
import { sendEmail, OWNER_EMAIL, escapeHtml } from '@/lib/email'

export const dynamic = 'force-dynamic'

const TOPICS = ['Listing', 'Account', 'Purchase', 'Accessibility', 'Something else'] as const

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (typeof body.company === 'string' && body.company.trim()) return NextResponse.json({ ok: true })
  const topic = TOPICS.includes(body.topic) ? body.topic : 'Something else'
  const email = String(body.email ?? '').trim().toLowerCase()
  const message = String(body.message ?? '').trim()
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email so we can reply.' }, { status: 400 })
  if (message.length < 8) return NextResponse.json({ error: 'Tell us a little more than that.' }, { status: 400 })
  if (message.length > 4000) return NextResponse.json({ error: 'That message is too long. Keep it under 4,000 characters.' }, { status: 400 })
  const to = process.env.OWNER_EMAIL?.trim() || OWNER_EMAIL
  const safe = escapeHtml(message)
  const result = await sendEmail({
    to,
    subject: `VibePeep contact: ${topic}`,
    html: `<p><strong>${escapeHtml(topic)}</strong> from ${escapeHtml(email)}</p><p>${safe.replace(/\n/g, '<br>')}</p>`,
    text: `${topic}\nFrom: ${email}\n\n${message}`,
  })
  if (!result.ok && !result.disabled) return NextResponse.json({ error: 'We could not send that. Try again in a minute.' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
