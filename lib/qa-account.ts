/**
 * Synthetic QA logins. They stay in the database for later tests and never
 * count as audience, newsletter subscribers, or reminder recipients.
 * The address shape is the flag: the user table has no separate test column.
 */
const QA_EMAIL = /^outza-tester\+qa-[a-z0-9-]+@mail\.grokbot\.com$/

export function isQaAccountEmail(email: string | null | undefined): boolean {
  return !!email && QA_EMAIL.test(email.trim().toLowerCase())
}

/** Prisma filter: opted-in people who are not QA accounts. */
export function liveSubscriberWhere() {
  return {
    emailOptIn: true as const,
    NOT: {
      AND: [
        { email: { startsWith: 'outza-tester+qa-' } },
        { email: { endsWith: '@mail.grokbot.com' } },
      ],
    },
  }
}
