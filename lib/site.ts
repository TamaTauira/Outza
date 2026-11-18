/** Business identity from the environment. Missing values render as nothing. */

function clean(name: string): string | null {
  const value = process.env[name]?.trim()
  return value || null
}

export function legalEntity(): string | null {
  return clean('LEGAL_ENTITY')
}

export function businessAbn(): string | null {
  return clean('BUSINESS_ABN') || clean('ABN')
}

export function supportEmail(): string | null {
  const value = clean('SUPPORT_EMAIL')
  return value && value.includes('@') ? value : null
}
