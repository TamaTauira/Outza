/** Shared password rules for signup, reset, and account changes. */

const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789', '1234567890',
  'qwerty', 'qwerty123', 'qwertyui', 'letmein', 'welcome', 'welcome1', 'iloveyou', 'admin',
  'admin123', 'abc123', '11111111', '00000000', 'sunshine', 'princess', 'football', 'baseball',
  'dragon', 'master', 'monkey', 'shadow', 'ashley', 'bailey', 'trustno1', 'superman', 'michael',
  'login', 'starwars', 'hello123', 'freedom', 'whatever', 'qazwsx', 'vibepeep', 'changeme',
])

export const PASSWORD_RULES = 'At least 8 characters, with a letter and a number. Not a common password.'

export function passwordError(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (password.length > 200) return 'That password is too long.'
  if (COMMON.has(password.toLowerCase())) return 'That password is too common. Pick something less obvious.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use at least one letter and one number.'
  return null
}
