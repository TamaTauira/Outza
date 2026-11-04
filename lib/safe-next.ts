/**
 * A same-site path safe to use after sign-in.
 * Rejects absolute URLs, protocol-relative URLs and backslash tricks.
 */
export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback
  const value = raw.trim()
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('://')) return fallback
  if (value.includes('\0') || value.length > 300) return fallback
  return value
}
