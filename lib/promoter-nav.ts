/** Fired after a same-page promoter tab change so the shell can follow the URL. */
export const PROMOTER_NAV_EVENT = 'vp-promoter-nav'

/** Keep the current query and set ?tab= so a refresh stays on the same section. */
export function promoterTabHref(currentSearch: string, tab: string): string {
  const params = new URLSearchParams(currentSearch.replace(/^\?/, ''))
  if (tab) params.set('tab', tab)
  else params.delete('tab')
  const query = params.toString()
  return query ? `/promoter?${query}` : '/promoter'
}

/** Login return path that keeps the promoter search, including ?tab=. */
export function promoterLoginHref(search: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === 'string') params.append(key, value)
    else if (Array.isArray(value)) for (const item of value) params.append(key, item)
  }
  const path = params.size ? `/promoter?${params.toString()}` : '/promoter'
  return `/login?next=${encodeURIComponent(path)}`
}
