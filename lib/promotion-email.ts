import { prisma } from '@/lib/db'
import { sendEmail, OWNER_EMAIL, escapeHtml, siteUrl } from '@/lib/email'
import { formatAud, productName, PRO_PLAN } from '@/lib/tiers'
import { EMAIL_C, emailBodyCell, emailDocument } from '@/lib/email-brand'

export async function notifyPromotionPurchased(promotionId: string, orderId?: string) {
  const p = await prisma.promotion.findUnique({
    where: { id: promotionId },
    include: { event: { select: { id: true, title: true, city: true } }, promoter: { select: { name: true, email: true, orgName: true } } },
  })
  if (!p) return
  const lines = orderId ? await prisma.promotion.findMany({ where: { orderId }, select: { tier: true, amountCents: true } }) : [{ tier: p.tier, amountCents: p.amountCents }]
  const total = lines.reduce((s, l) => s + l.amountCents, 0)
  const items = lines.map((l) => `${productName(l.tier)} (${formatAud(l.amountCents)})`).join(', ')
  const home = siteUrl()
  const html = emailDocument({
    title: 'New promotion purchase',
    preheader: `${p.event.title} · ${formatAud(total)}`,
    manageHref: `${home}/admin`,
    homeHref: home,
    reason: 'This note goes to the VibePeep owner when a promotion is purchased.',
    rows: emailBodyCell(`<h2 style="color:${EMAIL_C.orange};margin:0 0 12px;font-size:20px;">New promotion purchase${p.paymentMode === 'test' ? ' (test mode — no payment taken)' : ''}</h2>
    <div class="card" style="background:#f6f6f6;padding:16px;border-radius:8px;">
      <p style="margin:0 0 8px;"><strong>Event:</strong> <a class="tx" href="${home}/events/${p.event.id}">${escapeHtml(p.event.title)}</a> (${escapeHtml(p.event.city)})</p>
      <p style="margin:0 0 8px;"><strong>Promoter:</strong> ${escapeHtml(p.promoter.orgName || p.promoter.name)} (${escapeHtml(p.promoter.email)})</p>
      <p style="margin:0 0 8px;"><strong>Items:</strong> ${escapeHtml(items)}</p>
      <p style="margin:0 0 8px;"><strong>Total:</strong> ${formatAud(total)} AUD</p>
      <p style="margin:0;"><strong>Campaign length:</strong> ${p.days ?? 30} days · runs until ${p.endsAt?.toISOString().slice(0, 10) ?? '—'}</p>
    </div>`),
  })
  const r = await sendEmail({ to: OWNER_EMAIL, subject: `New promotion (${formatAud(total)}): ${p.event.title.slice(0, 60)}`, html })
  if (!r.ok) console.error('Promotion email failed:', r.error)
}

export async function notifyProPurchased(passId: string) {
  const p = await prisma.proPass.findUnique({ where: { id: passId }, include: { user: { select: { name: true, email: true, orgName: true } } } })
  if (!p) return
  const home = siteUrl()
  const html = emailDocument({
    title: `New ${PRO_PLAN.name} membership`,
    preheader: p.user.orgName || p.user.name || p.user.email,
    manageHref: `${home}/admin`,
    homeHref: home,
    reason: 'This note goes to the VibePeep owner when a membership is purchased.',
    rows: emailBodyCell(`<h2 style="color:${EMAIL_C.orange};margin:0 0 12px;font-size:20px;">New ${PRO_PLAN.name} membership${p.paymentMode === 'test' ? ' (test mode — no payment taken)' : ''}</h2>
    <div class="card" style="background:#f6f6f6;padding:16px;border-radius:8px;">
      <p style="margin:0 0 8px;"><strong>Promoter:</strong> ${escapeHtml(p.user.orgName || p.user.name)} (${escapeHtml(p.user.email)})</p>
      <p style="margin:0 0 8px;"><strong>Amount:</strong> ${formatAud(p.amountCents)} AUD</p>
      <p style="margin:0;"><strong>Pro until:</strong> ${p.endsAt?.toISOString().slice(0, 10) ?? '—'}</p>
    </div>`),
  })
  const r = await sendEmail({ to: OWNER_EMAIL, subject: `New ${PRO_PLAN.name} membership: ${p.user.orgName || p.user.name || p.user.email}`, html })
  if (!r.ok) console.error('Pro email failed:', r.error)
}
