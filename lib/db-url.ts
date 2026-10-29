/**
 * Serverless functions should talk to Neon through the pooled endpoint.
 * A direct connection from each Fluid instance exhausts the small compute
 * and pays a fresh TLS handshake on every cold start.
 */
export function pooledDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw || !raw.includes('.neon.tech')) return raw
  let next = raw
  if (!next.includes('-pooler')) {
    next = next.replace(/@([^/?]+)\.neon\.tech/, (_match, host: string) => {
      const endpoint = host.split('.')[0]
      if (!endpoint || endpoint.endsWith('-pooler')) return `@${host}.neon.tech`
      return `@${host.replace(endpoint, `${endpoint}-pooler`)}.neon.tech`
    })
  }
  const extra = ['pgbouncer=true', 'connection_limit=1', 'connect_timeout=15']
  for (const part of extra) {
    const key = part.slice(0, part.indexOf('='))
    if (!new RegExp(`[?&]${key}=`).test(next)) next += `${next.includes('?') ? '&' : '?'}${part}`
  }
  if (!/[?&]sslmode=/.test(next)) next += `${next.includes('?') ? '&' : '?'}sslmode=require`
  // PgBouncer rejects channel_binding=require, which direct Neon strings often set.
  next = next.replace(/([?&])channel_binding=[^&]*/g, '$1').replace(/\?&/g, '?').replace(/[?&]$/, '')
  return next
}
