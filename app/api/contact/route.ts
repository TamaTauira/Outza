import { NextResponse } from 'next/server'
import { sendEmail, OWNER_EMAIL, escapeHtml } from '@/lib/email'
import { prisma } from '@/lib/db'
import { extractEventId, triageContact, coerceTriage, type ContactTriage } from '@/lib/contact-triage'
import { llmConfigured, completeJson } from '@/lib/llm'

export const dynamic = 'force-dynamic'

const TOPICS = ['Listing', 'Account', 'Purchase', 'Accessibility', 'Something else'] as const

async function refine(topic: string, message: string, fallback: ContactTriage): Promise<ContactTriage> {
  if (!llmConfigured()) return fallback
  try {
    const output = await completeJson({
      timeoutMs: 12_000,
      temperature: 0,
      maxOutputTokens: 300,
      messages: [{
        role: 'user',
        content: `Sort this VibePeep contact message. category is one of: listing fix, account/login, purchase/refund, accessibility, partnership/ads, press, spam, feature request, other. urgency is low, normal or high. summary is one sentence. Return JSON {"category":"","urgency":"normal","summary":""}. Do not draft a customer email.\n\nTopic: ${topic}\n${message}`,
      }],
    })
    return coerceTriage(output, fallback)
  } catch (err) {
    console.error('[contact] triage', err instanceof Error ? err.message : err)
    return fallback
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (typeof body.company === 'string' && body.company.trim()) return NextResponse.json({ ok: true })
  const topic = TOPICS.includes(body.topic) ? body.topic : 'Something else'
  const email = String(body.email ?? '').trim().toLowerCase()
  const message = String(body.message ?? '').trim()
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email so we can reply.' }, { status: 400 })
  if (message.length < 8) return NextResponse.json({ error: 'Tell us a little more than that.' }, { status: 400 })
  if (message.length > 4000) return NextResponse.json({ error: 'That message is too long. Keep it under 4,000 characters.' }, { status: 400 })

  const triage = await refine(topic, message, triageContact({ topic, message }))
  let status = triage.status
  if (triage.category === 'listing fix') {
    const eventId = extractEventId(message)
    if (eventId) {
      const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } }).catch(() => null)
      if (event) {
        await prisma.eventReport.create({
          data: { eventId, email, reason: 'OTHER', details: message.slice(0, 2000), status: 'OPEN' },
        }).catch((err) => console.error('[contact] report', err instanceof Error ? err.message : err))
        status = 'CLOSED'
      }
    }
  }
  await prisma.contactMessage.create({
    data: {
      topic,
      email,
      message,
      status,
      category: triage.category,
      urgency: triage.urgency,
      aiSummary: triage.summary,
      draftReply: triage.draftReply,
    },
  }).catch((err) => console.error('[contact] store', err instanceof Error ? err.message : err))

  const to = process.env.OWNER_EMAIL?.trim() || OWNER_EMAIL
  const result = await sendEmail({
    to,
    subject: `VibePeep contact: ${topic}`,
    html: `<p><strong>${escapeHtml(topic)}</strong> from ${escapeHtml(email)}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p>Sorted as ${escapeHtml(triage.category)} (${escapeHtml(triage.urgency)}). ${escapeHtml(triage.summary)}</p>`,
    text: `${topic}\nFrom: ${email}\n\n${message}\n\nSorted as ${triage.category} (${triage.urgency}). ${triage.summary}`,
  })
  if (!result.ok && !result.disabled) return NextResponse.json({ error: 'We could not send that. Try again in a minute.' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
