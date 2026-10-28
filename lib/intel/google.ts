// Google Business Profile Performance API: per-promoter OAuth (business.manage), encrypted refresh tokens,
// tenant-isolated storage. Nothing here is simulated: if Google refuses access we record that status.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { siteUrl } from '@/lib/site-url'
import { GBP_METRICS } from './sources'

export const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage'
export const GBP_CALLBACK_PATH = '/api/intel/google/callback'

const encKey = () => createHash('sha256').update(process.env.INTEL_ENC_KEY || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '').digest()

export function encryptSecret(plain: string) {
  if (!process.env.INTEL_ENC_KEY && !process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) throw new Error('No encryption key configured')
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', encKey(), iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':')
}
export function decryptSecret(blob: string) {
  const [v, iv, tag, data] = blob.split(':')
  if (v !== 'v1') throw new Error('Unknown token format')
  const d = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8')
}

export const googleConfigured = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
export const callbackUrl = () => `${siteUrl()}${GBP_CALLBACK_PATH}`

export function authUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '', redirect_uri: callbackUrl(), response_type: 'code', scope: `openid email ${GBP_SCOPE}`,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

export async function exchangeCode(code: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? '', client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '', redirect_uri: callbackUrl(), grant_type: 'authorization_code' }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`Google token exchange failed: ${j?.error_description ?? j?.error ?? res.status}`)
  let email: string | null = null
  try { email = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64url').toString()).email ?? null } catch {}
  return { refreshToken: j.refresh_token as string | undefined, accessToken: j.access_token as string, scope: j.scope as string, email }
}

async function accessToken(conn: { refreshTokenEnc: string }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: decryptSecret(conn.refreshTokenEnc), client_id: process.env.GOOGLE_CLIENT_ID ?? '', client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '', grant_type: 'refresh_token' }),
  })
  const j = await res.json()
  if (!res.ok) throw new GbpError(`Google refused the stored authorisation (${j?.error ?? res.status}). Please reconnect.`, 'error')
  return j.access_token as string
}

export class GbpError extends Error { constructor(msg: string, public status: 'api_not_approved' | 'error') { super(msg) } }

async function gget(token: string, url: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(30_000) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = j?.error?.message ?? `HTTP ${res.status}`
    // Projects without approved Business Profile API access get 403 SERVICE_DISABLED / 429 with zero quota
    if (res.status === 403 || res.status === 429) throw new GbpError(`Google Business Profile API access is not available for this app yet: ${msg}`, 'api_not_approved')
    throw new GbpError(`Google API error: ${msg}`, 'error')
  }
  return j
}

export async function listLocations(userId: string) {
  const conn = await prisma.googleBusinessConnection.findUnique({ where: { userId } })
  if (!conn) throw new GbpError('Not connected', 'error')
  try {
    const token = await accessToken(conn)
    const acc = await gget(token, 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20')
    const out: { accountName: string; locationName: string; title: string; address: string }[] = []
    for (const a of (acc.accounts ?? []) as { name: string }[]) {
      const l = await gget(token, `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?pageSize=100&readMask=name,title,storefrontAddress`)
      for (const loc of (l.locations ?? []) as { name: string; title?: string; storefrontAddress?: { addressLines?: string[]; locality?: string } }[]) {
        out.push({ accountName: a.name, locationName: loc.name, title: loc.title ?? loc.name, address: [...(loc.storefrontAddress?.addressLines ?? []), loc.storefrontAddress?.locality].filter(Boolean).join(', ') })
      }
    }
    if (conn.status === 'api_not_approved' || conn.status === 'connected') await prisma.googleBusinessConnection.update({ where: { userId }, data: { status: conn.locationName ? conn.status : 'needs_location', lastError: null } })
    return out
  } catch (e) {
    if (e instanceof GbpError) await prisma.googleBusinessConnection.update({ where: { userId }, data: { status: e.status, lastError: e.message } })
    throw e
  }
}

const ymd = (d: Date) => ({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() })

export async function syncConnection(userId: string) {
  const conn = await prisma.googleBusinessConnection.findUnique({ where: { userId } })
  if (!conn?.locationName) throw new GbpError('Choose a Business Profile location first', 'error')
  try {
    const token = await accessToken(conn)
    const end = new Date(Date.now() - 2 * 86400_000), start = new Date(end.getTime() - 364 * 86400_000)
    const s = ymd(start), e = ymd(end)
    const q = new URLSearchParams()
    for (const m of Object.keys(GBP_METRICS)) q.append('dailyMetrics', m)
    q.set('dailyRange.start_date.year', String(s.y)); q.set('dailyRange.start_date.month', String(s.m)); q.set('dailyRange.start_date.day', String(s.d))
    q.set('dailyRange.end_date.year', String(e.y)); q.set('dailyRange.end_date.month', String(e.m)); q.set('dailyRange.end_date.day', String(e.d))
    const loc = conn.locationName.replace(/^.*?(locations\/[^/]+)$/, '$1')
    const j = await gget(token, `https://businessprofileperformance.googleapis.com/v1/${loc}:fetchMultiDailyMetricsTimeSeries?${q}`)
    const rows: { connectionId: string; locationName: string; metric: string; date: string; value: number }[] = []
    for (const series of (j.multiDailyMetricTimeSeries ?? []) as { dailyMetricTimeSeries?: { dailyMetric: string; timeSeries?: { datedValues?: { date: { year: number; month: number; day: number }; value?: string }[] } }[] }[]) {
      for (const ts of series.dailyMetricTimeSeries ?? []) {
        for (const dv of ts.timeSeries?.datedValues ?? []) {
          const date = `${dv.date.year}-${String(dv.date.month).padStart(2, '0')}-${String(dv.date.day).padStart(2, '0')}`
          rows.push({ connectionId: conn.id, locationName: loc, metric: ts.dailyMetric, date, value: Number(dv.value ?? 0) })
        }
      }
    }
    await prisma.googleBusinessMetric.deleteMany({ where: { connectionId: conn.id, NOT: { locationName: loc } } })
    for (const r of rows) await prisma.googleBusinessMetric.upsert({ where: { connectionId_locationName_metric_date: { connectionId: r.connectionId, locationName: r.locationName, metric: r.metric, date: r.date } }, create: r, update: { value: r.value } })
    // search keywords for the last 3 complete months (one request per month)
    let kw = 0
    for (let i = 1; i <= 3; i++) {
      const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - i, 1))
      const p = new URLSearchParams({ 'monthlyRange.start_month.year': String(d.getUTCFullYear()), 'monthlyRange.start_month.month': String(d.getUTCMonth() + 1), 'monthlyRange.end_month.year': String(d.getUTCFullYear()), 'monthlyRange.end_month.month': String(d.getUTCMonth() + 1), pageSize: '50' })
      const k = await gget(token, `https://businessprofileperformance.googleapis.com/v1/${loc}/searchkeywords/impressions/monthly?${p}`)
      const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      for (const c of (k.searchKeywordsCounts ?? []) as { searchKeyword: string; insightsValue?: { value?: string; threshold?: string } }[]) {
        const data = { impressions: c.insightsValue?.value != null ? Number(c.insightsValue.value) : null, threshold: c.insightsValue?.threshold != null ? Number(c.insightsValue.threshold) : null }
        await prisma.googleBusinessKeyword.upsert({ where: { connectionId_locationName_month_keyword: { connectionId: conn.id, locationName: loc, month, keyword: c.searchKeyword } }, create: { connectionId: conn.id, locationName: loc, month, keyword: c.searchKeyword, ...data }, update: data })
        kw++
      }
    }
    await prisma.googleBusinessConnection.update({ where: { userId }, data: { status: 'ok', lastSyncAt: new Date(), lastError: null } })
    return { metrics: rows.length, keywords: kw }
  } catch (e) {
    const status = e instanceof GbpError ? e.status : 'error'
    await prisma.googleBusinessConnection.update({ where: { userId }, data: { status, lastError: e instanceof Error ? e.message : String(e) } })
    throw e
  }
}

export async function disconnect(userId: string) {
  const conn = await prisma.googleBusinessConnection.findUnique({ where: { userId } })
  if (!conn) return { revoked: false }
  let revoked = false
  try {
    const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptSecret(conn.refreshTokenEnc))}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    revoked = res.ok
  } catch (e) { console.error('[GBP] revoke failed:', e) }
  await prisma.googleBusinessMetric.deleteMany({ where: { connectionId: conn.id } })
  await prisma.googleBusinessKeyword.deleteMany({ where: { connectionId: conn.id } })
  await prisma.googleBusinessConnection.delete({ where: { userId } })
  return { revoked }
}

/** Client-safe view of a connection (never includes tokens). Always scoped to the requesting user. */
export async function connectionView(userId: string) {
  const c = await prisma.googleBusinessConnection.findUnique({ where: { userId }, select: { id: true, status: true, googleEmail: true, locationName: true, locationTitle: true, lastSyncAt: true, lastError: true, createdAt: true } })
  if (!c) return null
  const metrics = await prisma.googleBusinessMetric.findMany({ where: { connectionId: c.id, ...(c.locationName ? { locationName: c.locationName.replace(/^.*?(locations\/[^/]+)$/, '$1') } : {}) }, orderBy: { date: 'asc' }, select: { metric: true, date: true, value: true } })
  const keywords = await prisma.googleBusinessKeyword.findMany({ where: { connectionId: c.id }, orderBy: [{ month: 'desc' }, { impressions: 'desc' }], take: 60, select: { month: true, keyword: true, impressions: true, threshold: true } })
  const { id: _id, ...rest } = c
  return { ...rest, metrics, keywords }
}

export async function syncAllConnections() {
  const conns = await prisma.googleBusinessConnection.findMany({ where: { locationName: { not: null }, status: { in: ['ok', 'connected', 'needs_location', 'api_not_approved'] } }, select: { userId: true } })
  let ok = 0, failed = 0
  for (const c of conns) { try { await syncConnection(c.userId); ok++ } catch { failed++ } }
  return { ok, failed, total: conns.length }
}
