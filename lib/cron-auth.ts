/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admin sessions and `x-cron-secret` are also accepted. */
export function cronAuthorized(
  req: { headers: { get(name: string): string | null } },
  sessionRole: string | null | undefined,
): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  const bearer = req.headers.get('authorization')
  const header = req.headers.get('x-cron-secret')
  const authed = !!secret && (bearer === `Bearer ${secret}` || header === secret)
  return authed || sessionRole === 'ADMIN'
}
