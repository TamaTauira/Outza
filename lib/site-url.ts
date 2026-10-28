/**
 * Canonical public origin for metadata, sitemaps, emails and JSON-LD.
 * Never falls back to localhost once the app is deployed.
 */
export function siteUrl(): string {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '').trim()
  if (explicit && !/localhost|127\.0\.0\.1/i.test(explicit)) return explicit.replace(/\/$/, '')

  const auth = (process.env.NEXTAUTH_URL || '').trim()
  if (auth && !/localhost|127\.0\.0\.1/i.test(auth)) return auth.replace(/\/$/, '')

  const production = (process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim()
  if (production) return `https://${production.replace(/^https?:\/\//, '').replace(/\/$/, '')}`

  const vercel = (process.env.VERCEL_URL || '').trim()
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/$/, '')}`

  return 'https://outza-outza.vercel.app'
}
