/** Dependabot titles look like "Bump next from 16.4.1 to 17.0.0". */
export function isMajorBump(title: string): boolean {
  const match = title.match(/from (\d+)\.\d+\.\d+ to (\d+)\.\d+\.\d+/i)
  if (!match) return false
  return Number(match[2]) > Number(match[1])
}

/** Open major dependency pulls, when a GitHub token is set. Empty when it is not. */
export async function majorDependencyTitles(): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()
  if (!token) return []
  try {
    const res = await fetch('https://api.github.com/repos/TamaTauira/Outza/pulls?state=open&per_page=50', {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'vibepeep-ops' },
    })
    if (!res.ok) return []
    const pulls = await res.json() as { title?: string; user?: { login?: string } }[]
    return pulls
      .filter((pull) => pull.user?.login === 'dependabot[bot]' && isMajorBump(pull.title ?? ''))
      .map((pull) => pull.title ?? '')
      .filter(Boolean)
  } catch (err) {
    console.error('[ops] dependency lookup failed', err instanceof Error ? err.message : err)
    return []
  }
}
