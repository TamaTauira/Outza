import { prisma } from '@/lib/db'
import { sendEmail, OWNER_EMAIL, escapeHtml, siteUrl } from '@/lib/email'
import { formatAud, productName, PRO_PLAN } from '@/lib/tiers'
import { EMAIL_C, emailBodyCell, emailDocument, emailLink, emailPanel } from '@/lib/email-brand'

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
    preheader: `${formatAud(total)} recorded for a promotion.`,
    manageHref: `${home}/admin`,
    manageLabel: 'Admin',
    banner: 'promotion',
    homeHref: home,
    reason: 'This note goes to the VibePeep owner when a promotion is purchased.',
    rows: emailBodyCell(`<h2 class="tx" style="color:${EMAIL_C.ink};margin:0 0 12px;font-size:20px;line-height:1.25;">New promotion purchase${p.paymentMode === 'test' ? ' (test mode. No payment taken)' : ''}</h2>
    ${emailPanel(`<p class="tx" style="margin:0 0 8px;color:${EMAIL_C.ink};"><strong>Event:</strong> ${emailLink(`${home}/events/${p.event.id}`, p.event.title)} (${escapeHtml(p.event.city)})</p>
      <p class="tx" style="margin:0 0 8px;color:${EMAIL_C.ink};"><strong>Promoter:</strong> ${escapeHtml(p.promoter.orgName || p.promoter.name)} (${escapeHtml(p.promoter.email)})</p>
      <p class="tx" style="margin:0 0 8px;color:${EMAIL_C.ink};"><strong>Items:</strong> ${escapeHtml(items)}</p>
      <p class="tx" style="margin:0 0 8px;color:${EMAIL_C.ink};"><strong>Total:</strong> ${formatAud(total)} AUD</p>
      <p class="tx" style="margin:0;color:${EMAIL_C.ink};"><strong>Campaign length:</strong> ${p.days ?? 30} days, runs until ${p.endsAt?.toISOString().slice(0, 10) ?? 'not set'}</p>`)}`),
  })
  const text = `New promotion purchase\nEvent: ${p.event.title} (${p.event.city})\nPromoter: ${p.promoter.orgName || p.promoter.name} (${p.promoter.email})\nItems: ${items}\nTotal: ${formatAud(total)} AUD\n${home}/events/${p.event.id}`
  const r = await sendEmail({ to: OWNER_EMAIL, subject: `New promotion (${formatAud(total)}): ${p.event.title.slice(0, 60)}`, html, text })
  if (!r.ok) console.error('Promotion email failed:', r.error)
}

export async function notifyProPurchased(passId: string) {
  const p = await prisma.proPass.findUnique({ where: { id: passId }, include: { user: { select: { name: true, email: true, orgName: true } } } })
  if (!p) return
  const home = siteUrl()
  const html = emailDocument({
    title: `New ${PRO_PLAN.name} membership`,
    preheader: `${formatAud(p.amountCents)} recorded for a Pro membership.`,
    manageHref: `${home}/admin`,
    manageLabel: 'Admin',
    banner: 'pro',
    homeHref: home,
    reason: 'This note goes to the VibePeep owner when a membership is purchased.',
    rows: emailBodyCell(`<h2 class="tx" style="color:${EMAIL_C.ink};margin:0 0 12px;font-size:20px;line-height:1.25;">New ${PRO_PLAN.name} membership${p.paymentMode === 'test' ? ' (test mode. No payment taken)' : ''}</h2>
    ${emailPanel(`<p class="tx" style="margin:0 0 8px;color:${EMAIL_C.ink};"><strong>Promoter:</strong> ${escapeHtml(p.user.orgName || p.user.name)} (${escapeHtml(p.user.email)})</p>
      <p class="tx" style="margin:0 0 8px;color:${EMAIL_C.ink};"><strong>Amount:</strong> ${formatAud(p.amountCents)} AUD</p>
      <p class="tx" style="margin:0;color:${EMAIL_C.ink};"><strong>Pro until:</strong> ${p.endsAt?.toISOString().slice(0, 10) ?? 'not set'}</p>`)}`),
  })
  const text = `New ${PRO_PLAN.name} membership\nPromoter: ${p.user.orgName || p.user.name} (${p.user.email})\nAmount: ${formatAud(p.amountCents)} AUD\nPro until: ${p.endsAt?.toISOString().slice(0, 10) ?? 'not set'}`
  const r = await sendEmail({ to: OWNER_EMAIL, subject: `New ${PRO_PLAN.name} membership: ${p.user.orgName || p.user.name || p.user.email}`, html, text })
  if (!r.ok) console.error('Pro email failed:', r.error)
}
