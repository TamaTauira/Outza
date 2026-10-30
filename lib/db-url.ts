/**
 * Serverless functions should talk to Neon through the pooled endpoint.
 * A direct connection from each Fluid instance exhausts the small compute
 * and pays a fresh TLS handshake on every cold start.
 *
 * `connection_limit` sizes Prisma's pool inside one process, not Neon's
 * compute. Fluid serves concurrent requests on that process, so a limit of 1
 * queues event-page reads behind the refresh and they fail with P2024 once
 * `pool_timeout` elapses. The pooler is what keeps those clients off the
 * 0.25 CU direct session limit.
 */
export const INTERACTIVE_CONNECTION_LIMIT = 10
/** Quality-pass batches and the image pass stay within this so the job client cannot P2024 itself. */
export const JOB_CONNECTION_LIMIT = 8
export const POOL_TIMEOUT_SECONDS = 15

export type PooledUrlOptions = {
  connectionLimit?: number
  poolTimeoutSeconds?: number
}

function setParam(url: string, key: string, value: string): string {
  const pattern = new RegExp(`([?&])${key}=[^&]*`)
  if (pattern.test(url)) return url.replace(pattern, `$1${key}=${value}`)
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${value}`
}

export function pooledDatabaseUrl(raw: string | undefined, opts: PooledUrlOptions = {}): string | undefined {
  if (!raw || !raw.includes('.neon.tech')) return raw
  let next = raw
  if (!next.includes('-pooler')) {
    next = next.replace(/@([^/?]+)\.neon.tech/, (_match, host: string) => {
      const endpoint = host.split('.')[0]
      if (!endpoint || endpoint.endsWith('-pooler')) return `@${host}.neon.tech`
      return `@${host.replace(endpoint, `${endpoint}-pooler`)}.neon.tech`
    })
  }
  // PgBouncer rejects channel_binding=require, which direct Neon strings often set.
  next = next.replace(/([?&])channel_binding=[^&]*/g, '$1').replace(/&&+/g, '&').replace(/\?&/g, '?').replace(/[?&]$/, '')
  for (const [key, value] of [['pgbouncer', 'true'], ['connect_timeout', '15']] as const) {
    if (!new RegExp(`[?&]${key}=`).test(next)) next += `${next.includes('?') ? '&' : '?'}${key}=${value}`
  }
  // Always overwrite. A baked-in connection_limit=1 is what starves Fluid.
  next = setParam(next, 'connection_limit', String(opts.connectionLimit ?? INTERACTIVE_CONNECTION_LIMIT))
  next = setParam(next, 'pool_timeout', String(opts.poolTimeoutSeconds ?? POOL_TIMEOUT_SECONDS))
  if (!/[?&]sslmode=/.test(next)) next += `${next.includes('?') ? '&' : '?'}sslmode=require`
  return next
}
