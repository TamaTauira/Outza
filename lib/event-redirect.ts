import { eventPath } from '@/lib/seo'

/**
 * Bare `/events/<id>` paths (no title slug). Slug URLs always contain a hyphen
 * because the canonical form is `/events/<title-slug>-<id>` and ids do not.
 */
export function bareEventId(pathname: string): string | null {
  const match = /^\/events\/([^/]+)$/.exec(pathname)
  if (!match) return null
  let param = match[1]!
  try { param = decodeURIComponent(param) } catch { return null }
  if (!param || param.includes('-') || param.includes('.') || param.length > 64) return null
  return param
}

/** Canonical slug path for a bare id, or null when no 301 is needed. */
export function redirectTargetForBareId(param: string, event: { id: string; title?: string | null } | null): string | null {
  if (!event || event.id !== param) return null
  const canonical = eventPath(event)
  if (canonical === `/events/${param}`) return null
  return canonical
}
