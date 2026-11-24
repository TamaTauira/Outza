import { timingSafeEqual } from 'crypto'

/** True when the request presents OPS_READ_TOKEN. The token is never logged. */
export function opsReadAuthorized(req: { headers: { get(name: string): string | null } }): boolean {
  const token = process.env.OPS_READ_TOKEN?.trim() ?? ''
  if (token.length < 16) return false
  const header = req.headers.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const left = Buffer.from(presented)
  const right = Buffer.from(token)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function opsReadDatabaseRole(): 'readonly' | 'primary' {
  return process.env.DATABASE_URL_READONLY?.trim() ? 'readonly' : 'primary'
}
