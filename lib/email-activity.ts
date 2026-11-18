/**
 * Whether a person's newsletter opens and link clicks may be stored and used
 * to rank later picks.
 *
 * Region is the Vercel `x-vercel-ip-country` header at the moment a password
 * account is created. Home city is not used: the city list is Australian and
 * new accounts default to Sydney.
 *
 * Australia (AU) defaults on. Disclosure on /privacy is the basis for that.
 * EU, EEA, UK, any other code, and a missing header default off.
 * Google signup cannot see that header, so those new accounts stay off until
 * the person turns the account toggle on.
 *
 * Existing accounts are not reclassified. The migration sets them on, because
 * no country was stored for them.
 */

const EU_EEA_UK = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO',
  'GB', 'UK',
])

export function emailActivityDefault(country: string | null | undefined): boolean {
  const code = (country ?? '').trim().toUpperCase()
  if (code === 'AU') return true
  if (EU_EEA_UK.has(code)) return false
  return false
}

/** True only when this account has allowed email-activity personalisation. */
export function emailActivityAllowed(flag: boolean | null | undefined): boolean {
  return flag === true
}
