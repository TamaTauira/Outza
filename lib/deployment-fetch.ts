/**
 * Pins a same-origin fetch to the deployment that served this page.
 * Next.js already attaches the deployment id to its own navigations. Custom
 * fetch() calls do not, so after a deploy an open tab can call the new API
 * with the old page. Vercel routes `x-deployment-id` back to that deployment
 * when Skew Protection is on. The id is the `data-dpl-id` Next writes on
 * `<html>` — no extra next.config deploymentId, because Vercel sets that
 * during the build and a hand-set id starting with `dpl_` is rejected.
 */

export type PinnedFetch = { input: RequestInfo | URL; init?: RequestInit }

const DEPLOYMENT_HEADER = 'x-deployment-id'

function requestUrl(input: RequestInfo | URL): string | null {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url
  return null
}

/** Adds the deployment id to a same-origin request. Leaves everything else untouched. */
export function pinSameOriginFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  opts: { deploymentId?: string | null; pageOrigin: string },
): PinnedFetch {
  const deploymentId = opts.deploymentId?.trim()
  if (!deploymentId) return { input, init }
  const raw = requestUrl(input)
  if (!raw) return { input, init }
  let parsed: URL
  try {
    parsed = new URL(raw, opts.pageOrigin)
  } catch {
    return { input, init }
  }
  if (parsed.origin !== opts.pageOrigin) return { input, init }

  const headers = new Headers(typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined)
  if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  if (!headers.has(DEPLOYMENT_HEADER)) headers.set(DEPLOYMENT_HEADER, deploymentId)
  return { input, init: { ...init, headers } }
}

const INSTALLED = '__vibepeepDeploymentFetch'

/** Patches window.fetch once. No-ops without a document deployment id (local dev, tests). */
export function installDeploymentFetchPin(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  const scoped = window as Window & { [INSTALLED]?: boolean }
  if (scoped[INSTALLED]) return true
  const deploymentId = document.documentElement?.getAttribute('data-dpl-id')
  if (!deploymentId) return false
  const original = window.fetch.bind(window)
  const pageOrigin = window.location.origin
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const pinned = pinSameOriginFetch(input, init, { deploymentId, pageOrigin })
    return original(pinned.input, pinned.init)
  }) as typeof window.fetch
  scoped[INSTALLED] = true
  return true
}
