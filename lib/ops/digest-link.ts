import { verifyDigestToken, tokenHash, type DigestAction } from '@/lib/ops/tokens'

export type StoredToken = {
  id: string
  tokenHash: string
  itemId: string
  action: DigestAction
  expiresAt: Date
  usedAt: Date | null
}

export type StoredDigestItem = {
  id: string
  status: string
  summary: string
  payload: Record<string, unknown> | null
}

export interface DigestStore {
  findToken(hash: string): Promise<StoredToken | null>
  findItem(id: string): Promise<StoredDigestItem | null>
  /** Marks this token used only when it is still unused. False means someone else won. */
  claimToken(id: string, at: Date): Promise<boolean>
  /** Puts a claimed token back if applying the decision failed. */
  releaseToken(id: string): Promise<void>
  markItemTokensUsed(itemId: string, at: Date): Promise<void>
  resolveItem(id: string, status: 'APPROVED' | 'DECLINED', at: Date): Promise<void>
}

export type ConsumeResult =
  | { status: 'applied'; action: DigestAction; item: StoredDigestItem }
  | { status: 'used' | 'expired' | 'invalid' | 'unconfigured' }

export async function consumeDigestLink(opts: {
  token: string
  now?: number
  store: DigestStore
  apply: (item: StoredDigestItem, action: DigestAction) => Promise<void>
}): Promise<ConsumeResult> {
  const now = opts.now ?? Date.now()
  const checked = verifyDigestToken(opts.token, now)
  if (!checked.ok) return { status: checked.reason }
  const row = await opts.store.findToken(tokenHash(opts.token))
  if (!row || row.itemId !== checked.payload.itemId || row.action !== checked.payload.action) return { status: 'invalid' }
  if (row.usedAt) return { status: 'used' }
  if (row.expiresAt.getTime() < now) return { status: 'expired' }
  const item = await opts.store.findItem(row.itemId)
  if (!item || item.status !== 'OPEN') return { status: 'used' }
  const won = await opts.store.claimToken(row.id, new Date(now))
  if (!won) return { status: 'used' }
  try {
    await opts.apply(item, checked.payload.action)
    await opts.store.resolveItem(item.id, checked.payload.action === 'approve' ? 'APPROVED' : 'DECLINED', new Date(now))
    await opts.store.markItemTokensUsed(item.id, new Date(now))
  } catch (err) {
    await opts.store.releaseToken(row.id)
    throw err
  }
  return { status: 'applied', action: checked.payload.action, item }
}

export function digestResultPage(result: ConsumeResult): string {
  const copy: Record<ConsumeResult['status'], { title: string; body: string }> = {
    applied: {
      title: result.status === 'applied' && result.action === 'decline' ? 'Declined' : 'Approved',
      body: 'That choice is saved. You can undo a bot or digest decision for 30 days from Operations.',
    },
    used: { title: 'Already used', body: 'This link has already been used. Each link works once.' },
    expired: { title: 'Link expired', body: 'This link is older than 14 days. Open Operations to decide there.' },
    invalid: { title: 'Link not valid', body: 'This link does not match a decision we sent.' },
    unconfigured: { title: 'Links are not ready', body: 'The signing secret is not set on the server yet.' },
  }
  const view = copy[result.status]
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${view.title} — VibePeep</title></head>
<body style="margin:0;background:#f6f4ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#161a16;">
<main style="max-width:32rem;margin:0 auto;padding:48px 20px;">
<a href="/" style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;color:inherit;">
<img src="/vibepeep-icon.svg?v=3" alt="" width="40" height="40"/>
<img src="/vibepeep-wordmark.png" alt="VibePeep" width="168" height="36"/>
</a>
<h1 style="font-size:32px;line-height:1.15;letter-spacing:-0.02em;margin:28px 0 8px;">${view.title}</h1>
<p style="font-size:17px;line-height:1.5;color:#5c615c;margin:0;">${view.body}</p>
<p style="margin-top:28px;"><a href="/admin/ops" style="color:#9a3412;">Open Operations</a></p>
</main></body></html>`
}
