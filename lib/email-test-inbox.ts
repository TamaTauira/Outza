/**
 * Gallery test sends. They never follow an address typed into the form
 * unless it is exactly EMAIL_TEST_INBOX. Customer lists are not a target.
 */
export function configuredTestInbox(raw = process.env.EMAIL_TEST_INBOX): string | null {
  const inbox = raw?.trim().toLowerCase() ?? ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inbox)) return null
  return inbox
}

export function assertTestInbox(to: string, raw = process.env.EMAIL_TEST_INBOX): { ok: true; to: string } | { ok: false; error: string } {
  const inbox = configuredTestInbox(raw)
  if (!inbox) return { ok: false, error: 'Test sends are off until EMAIL_TEST_INBOX is set.' }
  const dest = to.trim().toLowerCase()
  if (dest !== inbox) return { ok: false, error: 'That address is not the test inbox.' }
  return { ok: true, to: inbox }
}
