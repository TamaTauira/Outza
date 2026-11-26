import { EMAIL_ADDRESS, EMAIL_C, EMAIL_OPT_OUT_LINE, emailBodyCell, emailButton, emailCode, emailDocument, emailEscape, emailLink, emailPasteLink, emailPlainFooter, emailSentence, emailVenueName } from '@/lib/email-brand'
import { listUnsubscribeHeaders, type MailKind } from '@/lib/email'
import { CANONICAL_SITE_URL } from '@/lib/site-url'
import { sampleWatchEmail } from '@/lib/email-preview'
import { composeWatchEmail } from '@/lib/watch-shared'
import { previewPromoterReport } from '@/lib/promoter-report'
import { previewVenueMonthly } from '@/lib/venue-monthly'
import { renderHtml, type RenderInput, type Slot } from '@/lib/newsletter/render'
import type { NlEvent } from '@/lib/newsletter/rank'

export type TemplateId =
  | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8'
  | 'L1' | 'L2' | 'L3'
  | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9' | 'C10' | 'C11'
  | 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9' | 'P10' | 'P11' | 'P12' | 'P13' | 'P14' | 'P15' | 'P16' | 'P17' | 'P18' | 'P19'
  | 'S1' | 'S2' | 'S3' | 'S4'
  | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6'

export type TemplatePriority = 'launch-must' | 'soon' | 'later'
export type CatalogueKind = MailKind

export type MailData = {
  name?: string
  email?: string
  event?: string
  venue?: string
  date?: string
  time?: string
  oldDate?: string
  oldTime?: string
  newDate?: string
  newTime?: string
  reason?: string
  href?: string
  manageHref?: string
  posterHref?: string
  /** Signed page link for the footer. The one-click header is separate. */
  unsubscribeHref?: string
  who?: string
  plan?: string
  code?: string
  when?: string
  amount?: string
  endDate?: string
  bullets?: string[]
}

export type CatalogueEntry = {
  id: TemplateId
  name: string
  group: string
  priority: TemplatePriority
  kind: CatalogueKind
  wired: boolean
  /** File stem under public/email-headers/. */
  banner: string
  needsNewBanner: boolean
  subject: string
  title: string
  kicker?: string
  paragraphs: string[]
  cta?: string
  reason?: string
}

type Spec = CatalogueEntry & {
  subjectOf: (d: MailData) => string
  paragraphsOf: (d: MailData) => string[]
  ctaOf?: (d: MailData) => { href: string; label: string }
  bulletsOf?: (d: MailData) => string[]
  composer?: 'newsletter' | 'watch' | 'reminder'
}

const HOME = CANONICAL_SITE_URL

export const SAMPLE_MAIL: MailData = {
  name: 'Sam',
  email: 'sam@example.com',
  event: 'Friday night at The Imperial',
  venue: 'The Imperial',
  date: 'Sat 7 Nov',
  time: '7:30 pm',
  oldDate: 'Fri 6 Nov',
  oldTime: '8:00 pm',
  newDate: 'Sat 7 Nov',
  newTime: '7:30 pm',
  reason: 'the details don’t match the organiser’s site',
  who: 'Sam',
  plan: 'Saturday in Newtown',
  code: '482913',
  when: '27 November 2026',
  amount: '$19',
  endDate: 'Sat 27 Dec',
  bullets: [
    'The policy explains more clearly what we collect and why.',
    'It applies when you accept the new version.',
  ],
}

/** Drop a second "at {venue}" when the title already names that venue. */
function placeClause(data: MailData): string {
  const venue = (data.venue || '').trim()
  const event = (data.event || '').trim()
  if (!venue || event.toLowerCase().includes(venue.toLowerCase())) return ''
  return ` at ${venue}`
}

function fill(template: string, data: MailData): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = data[key as keyof MailData]
    return typeof value === 'string' ? value : ''
  })
}

function spec(row: Omit<Spec, 'subject' | 'paragraphs' | 'subjectOf' | 'paragraphsOf'> & { subject: string; paragraphs: string[]; subjectOf?: Spec['subjectOf']; paragraphsOf?: Spec['paragraphsOf'] }): Spec {
  return {
    ...row,
    subjectOf: row.subjectOf ?? ((d) => fill(row.subject, d)),
    paragraphsOf: row.paragraphsOf ?? ((d) => row.paragraphs.map((line) => fill(line, d))),
  }
}

const account = (id: TemplateId, extra: Partial<Spec> & Pick<Spec, 'name' | 'priority' | 'wired' | 'subject' | 'title' | 'paragraphs' | 'needsNewBanner'>): Spec => spec({
  id,
  group: 'Account',
  kind: 'transactional',
  banner: 'account',
  reason: 'This message is about your VibePeep account.',
  cta: 'Visit VibePeep',
  ctaOf: (d) => ({ href: d.href || HOME, label: extra.cta || 'Visit VibePeep' }),
  ...extra,
})

const SPECS: Spec[] = [
  account('A1', {
    name: 'Verify email', priority: 'launch-must', wired: true, needsNewBanner: false,
    subject: 'Confirm it’s you, then come peep', title: 'Confirm your email', cta: 'Confirm email',
    paragraphs: ['Open the link in the next day so we know this inbox is yours. Saving events and your account work once it’s confirmed.'],
    ctaOf: (d) => ({ href: d.href || `${HOME}/verify-email?token=${'a'.repeat(43)}`, label: 'Confirm email' }),
  }),
  account('A2', {
    name: 'Magic link', priority: 'later', wired: false, needsNewBanner: false, banner: 'account-security',
    subject: 'Your VibePeep sign-in link', title: 'Your sign-in link', cta: 'Sign in',
    paragraphs: ['This link signs you in once and then stops working. If you didn’t ask for it, you can ignore this email.'],
    ctaOf: (d) => ({ href: d.href || `${HOME}/login?token=${'c'.repeat(43)}`, label: 'Sign in' }),
  }),
  account('A3', {
    name: 'Password reset', priority: 'launch-must', wired: true, needsNewBanner: false, banner: 'account-security',
    subject: 'Reset your VibePeep password', title: 'Reset your password', cta: 'Choose a new password',
    paragraphs: ['Use this link once in the next hour to choose a new password. If you didn’t ask for this, you can ignore it — your password stays as it is.'],
    ctaOf: (d) => ({ href: d.href || `${HOME}/reset-password?token=${'b'.repeat(43)}`, label: 'Choose a new password' }),
  }),
  account('A4', {
    name: 'Password changed', priority: 'launch-must', wired: true, needsNewBanner: false, banner: 'account-security',
    subject: 'Your VibePeep password was changed', title: 'Your password was changed', cta: 'Reset your password',
    paragraphs: ['The password on your VibePeep account was just changed. If this was you, no need to do anything. If it wasn’t, reset it now and we’ll help you lock things down.'],
    ctaOf: (d) => ({ href: d.href || `${HOME}/forgot-password`, label: 'Reset your password' }),
  }),
  account('A5', {
    name: 'Email changed', priority: 'soon', wired: false, needsNewBanner: false, banner: 'account-security',
    subject: 'Your VibePeep email was changed', title: 'Your email was changed', cta: 'Contact VibePeep',
    paragraphs: ['The email on a VibePeep account was changed. If this was you, you’re set. If it wasn’t, contact us straight away so we can lock the account.'],
  }),
  account('A6', {
    name: 'New sign-in', priority: 'soon', wired: false, needsNewBanner: false, banner: 'account-security',
    subject: 'New sign-in on your VibePeep account', title: 'New sign-in', cta: 'Review your account',
    paragraphs: ['There was a new sign-in on your VibePeep account. If this was you, no need to do anything. If it wasn’t, reset your password.'],
  }),
  account('A7', {
    name: 'Account closed', priority: 'launch-must', wired: true, needsNewBanner: false, banner: 'account-closed',
    subject: 'Your VibePeep account is closed', title: 'Your account is closed', cta: 'Visit VibePeep',
    paragraphs: ['We’ve closed the VibePeep account for {email}. This doesn’t by itself refund a purchase — the refunds page covers those rights, including under the Australian Consumer Law. If this wasn’t you, contact us straight away.'],
  }),
  account('A8', {
    name: 'Data export ready', priority: 'later', wired: false, needsNewBanner: false, banner: 'account-security',
    subject: 'Your VibePeep data is ready', title: 'Your data export is ready', cta: 'Download your data',
    paragraphs: ['A copy of your VibePeep data is ready. The link expires. Don’t forward it.'],
  }),
  spec({
    id: 'L1', name: 'Updated terms', group: 'Legal', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'legal-update', needsNewBanner: false, cta: 'Read the updated terms',
    subject: 'We’ve updated our terms — please take a look', title: 'We’ve updated our terms',
    reason: 'This is a notice about the VibePeep terms of use.',
    paragraphs: ['A few things in the VibePeep terms of use have changed. They apply to your account when you accept the new version — we won’t treat you just keeping the tab open as a yes. Have a read when you can. The current terms stay in place until you accept.'],
    subjectOf: (d) => fill('We’ve updated our terms — please take a look', d),
    paragraphsOf: (d) => ['A few things in the VibePeep terms of use have changed. They apply to your account when you accept the new version — we won’t treat you just keeping the tab open as a yes. Have a read when you can. The current terms stay in place until you accept.'].map((line) => fill(line, d)),
    ctaOf: (d) => ({ href: d.href || `${HOME}/terms`, label: 'Read the updated terms' }),
  }),
  spec({
    id: 'L2', name: 'Updated privacy', group: 'Legal', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'legal-update', needsNewBanner: false, cta: 'Read the privacy policy',
    subject: 'A privacy update on VibePeep', title: 'We’ve updated our privacy policy',
    reason: 'This is a notice about the VibePeep privacy policy.',
    paragraphs: ['We’ve made a material change to how we explain what we collect and why. It applies to your account when you accept the new version.'],
    subjectOf: () => 'A privacy update on VibePeep',
    paragraphsOf: (d) => ['We’ve made a material change to how we explain what we collect and why. It applies to your account when you accept the new version.'],
    bulletsOf: (d) => d.bullets?.length ? d.bullets : SAMPLE_MAIL.bullets || [],
    ctaOf: (d) => ({ href: d.href || `${HOME}/privacy`, label: 'Read the privacy policy' }),
  }),
  spec({
    id: 'L3', name: 'Cookie changes', group: 'Legal', priority: 'later', kind: 'transactional', wired: false,
    banner: 'legal-update', needsNewBanner: false, cta: 'Manage cookies',
    subject: 'A quick update on cookies at VibePeep', title: 'A cookie update',
    reason: 'This is a notice about cookies on VibePeep.',
    paragraphs: ['We’ve changed how cookies and similar tools are described. You can review the detail and your preferences on the privacy page.'],
    subjectOf: () => 'A quick update on cookies at VibePeep',
    paragraphsOf: () => ['We’ve changed how cookies and similar tools are described. You can review the detail and your preferences on the privacy page.'],
    ctaOf: (d) => ({ href: d.href || `${HOME}/privacy`, label: 'Manage cookies' }),
  }),
  account('C1', {
    name: 'Welcome', priority: 'launch-must', wired: true, needsNewBanner: false, banner: 'welcome',
    subject: 'You’re in. Let’s go find something good.', title: 'Welcome to VibePeep', cta: 'Take a peep',
    paragraphs: ['Hey {name}, your account is ready. Browse what’s on, save the keepers, and we’ll nudge you before they slip by.'],
    ctaOf: (d) => ({ href: d.href || HOME, label: 'Take a peep' }),
  }),
  spec({
    id: 'C2', name: 'Newsletter', group: 'Consumer', priority: 'launch-must', kind: 'marketing', wired: true,
    banner: 'daily-drop', needsNewBanner: false, composer: 'newsletter',
    subject: 'Your couch can wait. Sydney can’t.', title: 'The Daily Drop',
    paragraphs: ['The live edition uses the tightened masthead: logo and edition, the orange-to-pink rule, then the banner, city and greeting.'],
    subjectOf: () => 'Your couch can wait. Sydney can’t.',
    paragraphsOf: () => [],
  }),
  spec({
    id: 'C3', name: 'Watch digest', group: 'Consumer', priority: 'launch-must', kind: 'marketing', wired: true,
    banner: 'matches', needsNewBanner: false, composer: 'watch',
    subject: 'Your keepers are calling', title: 'Your keepers are calling',
    paragraphs: [],
    subjectOf: () => 'Your keepers are calling',
    paragraphsOf: () => [],
  }),
  spec({
    id: 'C4', name: 'Saved-event reminder', group: 'Consumer', priority: 'launch-must', kind: 'marketing', wired: true,
    banner: 'reminder', needsNewBanner: false, composer: 'reminder',
    subject: 'A keeper is coming up', title: 'A keeper is coming up',
    paragraphs: [],
    subjectOf: () => 'A keeper is coming up',
    paragraphsOf: () => [],
  }),
  spec({
    id: 'C5', name: 'Price or time changed', group: 'Consumer', priority: 'soon', kind: 'transactional', wired: false,
    banner: 'event-update', needsNewBanner: false, cta: 'View the listing',
    subject: 'A time change on {event}', title: 'A detail changed',
    reason: 'You saved this event or added it to an Itinerary. This is a service update, not a newsletter.',
    paragraphs: ['{event} has a new time. It was {oldTime}. It’s now {time}. Have another look before you go.'],
    subjectOf: (d) => fill('A time change on {event}', d),
    paragraphsOf: (d) => [`${d.event || 'This event'} has a new time. It was ${d.oldTime || 'the old time'}. It’s now ${d.time || 'a new time'}${placeClause(d)}. Have another look before you go.`],
    ctaOf: (d) => ({ href: d.href || HOME, label: 'View the listing' }),
  }),
  spec({
    id: 'C6', name: 'Event cancelled', group: 'Consumer', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'event-update', needsNewBanner: false, cta: 'View the listing', kicker: 'Listing update',
    subject: 'A keeper has been cancelled: {event}', title: 'This event has been cancelled',
    reason: 'You saved this event or added it to an Itinerary. This is a service update, not a newsletter.',
    paragraphs: ['{event}, listed for {date} at {time}, has been cancelled. It’s off your Saved list and any Itinerary it was on. If you already bought tickets, contact the organiser or ticket site about a refund — VibePeep doesn’t sell tickets.'],
    subjectOf: (d) => fill('A keeper has been cancelled: {event}', d),
    paragraphsOf: (d) => [`${d.event || 'This event'}, listed for ${d.date || 'the listed day'} at ${d.time || 'the listed time'}${placeClause(d)}, has been cancelled. It’s off your Saved list and any Itinerary it was on. If you already bought tickets, contact the organiser or ticket site about a refund — VibePeep doesn’t sell tickets.`],
    ctaOf: (d) => ({ href: d.href || HOME, label: 'View the listing' }),
  }),
  spec({
    id: 'C7', name: 'Event postponed', group: 'Consumer', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'event-update', needsNewBanner: false, cta: 'View the new details',
    subject: '{event} has a new date', title: 'This event has been rescheduled',
    reason: 'You saved this event or added it to an Itinerary. This is a service update, not a newsletter.',
    paragraphs: ['{event} has moved. It was {oldDate} at {oldTime}. It’s now {newDate} at {newTime}. We’ve updated it on your Saved list and any Itinerary it was on. Double-check the new details before you go.'],
    subjectOf: (d) => d.newDate ? fill('{event} has a new date', d) : fill('{event} has been postponed', d),
    paragraphsOf: (d) => [d.newDate
      ? `${d.event || 'This event'} has moved. It was ${d.oldDate || 'the old day'} at ${d.oldTime || 'the old time'}. It’s now ${d.newDate} at ${d.newTime || 'the new time'}${placeClause(d)}. We’ve updated it on your Saved list and any Itinerary it was on. Double-check the new details before you go.`
      : `${d.event || 'This event'} has been postponed. It was listed for ${d.oldDate || 'the old day'} at ${d.oldTime || 'the old time'}${placeClause(d)}. The listing will show the new date when it’s set.`],
    ctaOf: (d) => ({ href: d.href || HOME, label: 'View the new details' }),
  }),
  spec({
    id: 'C8', name: 'Itinerary reminder', group: 'Consumer', priority: 'soon', kind: 'transactional', wired: false,
    banner: 'reminder', needsNewBanner: false, cta: 'Open your Itinerary',
    subject: 'Tonight’s on your Itinerary', title: 'Tonight’s on your Itinerary',
    reason: 'This note is about a stop on your Itinerary.',
    paragraphs: ['You’ve got stops lined up for tonight, starting with {event} at {time}. They’re in order on your Itinerary.'],
    subjectOf: () => 'Tonight’s on your Itinerary',
    paragraphsOf: (d) => [fill('You’ve got stops lined up for tonight, starting with {event} at {time}. They’re in order on your Itinerary.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/itinerary`, label: 'Open your Itinerary' }),
  }),
  spec({
    id: 'C9', name: 'Together invite', group: 'Consumer', priority: 'soon', kind: 'transactional', wired: false,
    banner: 'together', needsNewBanner: false, cta: 'Open the plan',
    subject: '{who} invited you to a plan on VibePeep', title: 'You’re invited',
    reason: 'Someone sent you a Together plan.',
    paragraphs: ['{who} invited you to {plan}. Open it to see the stops and add your own.'],
    subjectOf: (d) => fill('{who} invited you to a plan on VibePeep', d),
    paragraphsOf: (d) => [fill('{who} invited you to {plan}. Open it to see the stops and add your own.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/together`, label: 'Open the plan' }),
  }),
  spec({
    id: 'C10', name: 'Together vote', group: 'Consumer', priority: 'soon', kind: 'transactional', wired: false,
    banner: 'together', needsNewBanner: false, cta: 'Vote on the plan',
    subject: 'Your group needs a vote on {plan}', title: 'Your group needs a vote',
    reason: 'You’re on this Together plan.',
    paragraphs: ['{plan} has a change waiting. Open the plan to vote or see what moved.'],
    subjectOf: (d) => fill('Your group needs a vote on {plan}', d),
    paragraphsOf: (d) => [fill('{plan} has a change waiting. Open the plan to vote or see what moved.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/together`, label: 'Vote on the plan' }),
  }),
  spec({
    id: 'C11', name: 'Re-engagement', group: 'Consumer', priority: 'later', kind: 'marketing', wired: false,
    banner: 'newsletter', needsNewBanner: false, cta: 'Take a peep',
    subject: 'Your city has been busy. Take a peep?', title: 'Your city has been busy',
    reason: 'You asked for VibePeep emails. You can unsubscribe any time.',
    paragraphs: ['It’s been a while. There’s a fresh shortlist whenever you want it, and the unsubscribe link is in the footer if you’d rather stop.'],
    subjectOf: () => 'Your city has been busy. Take a peep?',
    paragraphsOf: () => ['It’s been a while. There’s a fresh shortlist whenever you want it, and the unsubscribe link is in the footer if you’d rather stop.'],
    ctaOf: (d) => ({ href: d.href || HOME, label: 'Take a peep' }),
  }),
  spec({
    id: 'P1', name: 'Listing verification code', group: 'Promoter', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'community', needsNewBanner: false, cta: 'Confirm the listing',
    subject: 'Your VibePeep code is in', title: 'Your code is in',
    reason: 'The code is only for you. VibePeep won’t show your email on the listing.',
    paragraphs: ['Your listing “{event}” is one code away from the neighbourhood. Enter the code, or use the button. It expires in 30 minutes.'],
    subjectOf: () => 'Your VibePeep code is in',
    paragraphsOf: (d) => [fill('Your listing “{event}” is one code away from the neighbourhood. Enter the code, or use the button. It expires in 30 minutes.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/local/verify`, label: 'Confirm the listing' }),
  }),
  spec({
    id: 'P2', name: 'Listing in review', group: 'Promoter', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'community-listing', needsNewBanner: false, cta: 'Review your listing',
    subject: 'VibePeep has your listing', title: 'VibePeep has your listing',
    reason: 'You submitted this listing.',
    paragraphs: ['Got it. A person will check “{event}” before it goes public. Keep the manage link. It’s the key to the listing.'],
    subjectOf: () => 'VibePeep has your listing',
    paragraphsOf: (d) => [fill('Got it. A person will check “{event}” before it goes public. Keep the manage link. It’s the key to the listing.', d)],
    ctaOf: (d) => ({ href: d.manageHref || d.href || HOME, label: 'Review your listing' }),
  }),
  spec({
    id: 'P3', name: 'Listing live', group: 'Promoter', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'community-listing', needsNewBanner: false, cta: 'View the listing',
    subject: 'Your VibePeep listing is live', title: 'It’s up',
    reason: 'You submitted this listing.',
    paragraphs: ['It’s up. Neighbours can peep “{event}” now. The manage link from your earlier email still edits, postpones or takes it down. A printable poster is on the listing tools.'],
    subjectOf: () => 'Your VibePeep listing is live',
    paragraphsOf: (d) => [fill('It’s up. Neighbours can peep “{event}” now. The manage link from your earlier email still edits, postpones or takes it down. A printable poster is on the listing tools.', d)],
    ctaOf: (d) => ({ href: d.href || HOME, label: 'View the listing' }),
  }),
  spec({
    id: 'P4', name: 'Listing rejected', group: 'Promoter', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'needs-changes', needsNewBanner: false, cta: 'Review your listing',
    subject: 'We couldn’t publish {event} just yet', title: 'We couldn’t publish this listing just yet',
    reason: 'You submitted this listing.',
    paragraphs: ['Thanks for sending {event}. We can’t put it on VibePeep as it stands, because {reason}. If you can fix that, you’re welcome to submit it again.'],
    subjectOf: (d) => fill('We couldn’t publish {event} just yet', d),
    paragraphsOf: (d) => [fill('Thanks for sending {event}. We can’t put it on VibePeep as it stands, because {reason}. If you can fix that, you’re welcome to submit it again.', d)],
    ctaOf: (d) => ({ href: d.manageHref || d.href || `${HOME}/local`, label: 'Review your listing' }),
  }),
  spec({
    id: 'P5', name: 'Listing removed', group: 'Promoter', priority: 'soon', kind: 'transactional', wired: false,
    banner: 'needs-changes', needsNewBanner: false, cta: 'Review your listing',
    subject: 'We took {event} off VibePeep', title: 'This listing was removed',
    reason: 'You submitted this listing.',
    paragraphs: ['{event} is no longer on VibePeep, because {reason}. The manage link still shows what we have on file.'],
    subjectOf: (d) => fill('We took {event} off VibePeep', d),
    paragraphsOf: (d) => [fill('{event} is no longer on VibePeep, because {reason}. The manage link still shows what we have on file.', d)],
    ctaOf: (d) => ({ href: d.manageHref || HOME, label: 'Review your listing' }),
  }),
  spec({
    id: 'P6', name: 'Event claim received', group: 'Promoter', priority: 'soon', kind: 'transactional', wired: false,
    banner: 'claim-approved', needsNewBanner: false, cta: 'Learn how claims work',
    subject: 'We’ve got your claim for {event}', title: 'We’ve got your claim',
    reason: 'You submitted an organiser claim.',
    paragraphs: ['We’ve got your claim for {event}. You’ll hear when it’s decided. You don’t need to send another one in the meantime.'],
    subjectOf: (d) => fill('We’ve got your claim for {event}', d),
    paragraphsOf: (d) => [fill('We’ve got your claim for {event}. You’ll hear when it’s decided. You don’t need to send another one in the meantime.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/promoter`, label: 'Learn how claims work' }),
  }),
  spec({
    id: 'P7', name: 'Event claim approved', group: 'Promoter', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'claim-approved', needsNewBanner: false, cta: 'Open promoter tools',
    subject: 'You’re down as the organiser for {event}', title: 'You can manage this listing',
    reason: 'Your organiser claim was approved.',
    paragraphs: ['Your claim for {event} is in. You can update the listing and see how it’s tracking from your promoter tools.'],
    subjectOf: (d) => fill('You’re down as the organiser for {event}', d),
    paragraphsOf: (d) => [fill('Your claim for {event} is in. You can update the listing and see how it’s tracking from your promoter tools.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/promoter`, label: 'Open promoter tools' }),
  }),
  spec({
    id: 'P8', name: 'Event claim rejected', group: 'Promoter', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'needs-changes', needsNewBanner: false, cta: 'Learn how claims work',
    subject: 'We couldn’t approve the claim for {event}', title: 'We couldn’t approve this claim',
    reason: 'Your organiser claim was reviewed.',
    paragraphs: ['We couldn’t match this claim for {event} to the organiser. Reason: {reason}. If you have a work email or a bit more evidence, you can try again.'],
    subjectOf: (d) => fill('We couldn’t approve the claim for {event}', d),
    paragraphsOf: (d) => [`We couldn’t match this claim for ${d.event || 'this event'} to the organiser. Reason: ${emailSentence(d.reason)}. If you have a work email or a bit more evidence, you can try again.`],
    ctaOf: (d) => ({ href: d.href || `${HOME}/promoter`, label: 'Learn how claims work' }),
  }),
  spec({
    id: 'P9', name: 'Venue claim code', group: 'Promoter', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'venue-code', needsNewBanner: false, cta: 'Confirm this inbox',
    subject: 'Your VibePeep code for {venue}', title: 'Your venue code',
    reason: 'Proving the inbox is not always enough to approve a venue claim.',
    paragraphs: ['Use the code below to show you can read mail for {venue}. The link works once. Opening it does not by itself decide ownership.'],
    subjectOf: (d) => fill('Your VibePeep code for {venue}', d),
    paragraphsOf: (d) => [fill('Use the code below to show you can read mail for {venue}. The link works once. Opening it does not by itself decide ownership.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/venues/verify`, label: 'Confirm this inbox' }),
  }),
  spec({
    id: 'P10', name: 'Venue claim approved', group: 'Promoter', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'claim-approved', needsNewBanner: false, cta: 'Open the venue dashboard',
    subject: '{venue} is yours to manage on VibePeep', title: 'You can manage {venue}',
    reason: 'Your venue claim was approved.',
    paragraphs: ['Your claim is in. You can edit the venue page, check listings tied to it, and add staff.'],
    subjectOf: (d) => fill('{venue} is yours to manage on VibePeep', d),
    paragraphsOf: (d) => [`Your claim is in. You can edit ${emailVenueName(d.venue)} page, check listings tied to it, and add staff.`],
    ctaOf: (d) => ({ href: d.href || `${HOME}/venue`, label: 'Open the venue dashboard' }),
  }),
  spec({
    id: 'P11', name: 'Venue claim rejected', group: 'Promoter', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'needs-changes', needsNewBanner: false, cta: 'Learn how venue claims work',
    subject: 'We couldn’t approve the claim for {venue}', title: 'We couldn’t approve this claim',
    reason: 'Your venue claim was reviewed.',
    paragraphs: ['We couldn’t approve the claim for {venue}. Reason: {reason}. If you can prove you manage this venue, you’re welcome to try again.'],
    subjectOf: (d) => fill('We couldn’t approve the claim for {venue}', d),
    paragraphsOf: (d) => [`We couldn’t approve the claim for ${emailVenueName(d.venue)}. Reason: ${emailSentence(d.reason)}. If you can prove you manage this venue, you’re welcome to try again.`],
    ctaOf: (d) => ({ href: d.href || `${HOME}/venue`, label: 'Learn how venue claims work' }),
  }),
  spec({
    id: 'P12', name: 'Venue manager invite', group: 'Promoter', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'venue-code', needsNewBanner: false, cta: 'Open the venue dashboard',
    subject: 'You’re invited to manage {venue} on VibePeep', title: 'You’re invited',
    reason: 'A venue administrator added you on VibePeep. This note does not change your newsletter.',
    paragraphs: ['You’ve been added as staff at {venue}. The dashboard is where hours, photos and the team live.'],
    subjectOf: (d) => fill('You’re invited to manage {venue} on VibePeep', d),
    paragraphsOf: (d) => [fill('You’ve been added as staff at {venue}. The dashboard is where hours, photos and the team live.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/venue`, label: 'Open the venue dashboard' }),
  }),
  spec({
    id: 'P13', name: 'Venue reported your listing', group: 'Promoter', priority: 'soon', kind: 'transactional', wired: true,
    banner: 'venue-check', needsNewBanner: false, cta: 'View the listing',
    subject: 'A venue asked us to check {event}', title: 'A venue asked us to check this listing',
    reason: 'You promote this listing.',
    paragraphs: ['A venue asked us to check {event}. The listing stays up meanwhile. We’ll look, and we won’t argue it out in this inbox.'],
    subjectOf: (d) => fill('A venue asked us to check {event}', d),
    paragraphsOf: (d) => [fill('A venue asked us to check {event}. The listing stays up meanwhile. We’ll look, and we won’t argue it out in this inbox.', d)],
    ctaOf: (d) => ({ href: d.href || HOME, label: 'View the listing' }),
  }),
  spec({
    id: 'P14', name: 'Claimed tick', group: 'Promoter', priority: 'soon', kind: 'transactional', wired: false,
    banner: 'claim-approved', needsNewBanner: false, cta: 'View the listing',
    subject: 'Your VibePeep tick is on {event}', title: 'Your tick is on',
    reason: 'Your claim was approved.',
    paragraphs: ['The tick is now on {event}. It means you manage the listing. It does not say the event is verified.'],
    subjectOf: (d) => fill('Your VibePeep tick is on {event}', d),
    paragraphsOf: (d) => [fill('The tick is now on {event}. It means you manage the listing. It does not say the event is verified.', d)],
    ctaOf: (d) => ({ href: d.href || HOME, label: 'View the listing' }),
  }),
  spec({
    id: 'P15', name: 'Weekly promoter report', group: 'Promoter', priority: 'soon', kind: 'report', wired: true,
    banner: 'promoter-report', needsNewBanner: false, cta: 'Open promoter tools',
    subject: 'Your VibePeep week, in one note', title: 'Your week, in one note',
    reason: 'You manage listings. Turning this note off does not change your newsletter.',
    paragraphs: ['Here’s how your listings tracked this week. Counts are the ones we actually recorded. Nothing here is an estimate.'],
    subjectOf: () => 'Your VibePeep week, in one note',
    paragraphsOf: () => ['Here’s how your listings tracked this week. Counts are the ones we actually recorded. Nothing here is an estimate.'],
    ctaOf: (d) => ({ href: d.href || `${HOME}/promoter`, label: 'Open promoter tools' }),
  }),
  spec({
    id: 'P16', name: 'Venue monthly stats', group: 'Promoter', priority: 'soon', kind: 'report', wired: true,
    banner: 'venue-monthly', needsNewBanner: false, cta: 'Open the venue dashboard',
    subject: 'Your month at {venue}: views, saves and clicks', title: 'Your venue month',
    reason: 'You manage a venue. Turning this note off does not change your newsletter.',
    paragraphs: ['Here’s the last 30 days for {venue}. Figures are the ones on record. We don’t fill gaps with estimates.'],
    subjectOf: (d) => fill('Your month at {venue}: views, saves and clicks', d),
    paragraphsOf: (d) => [fill('Here’s the last 30 days for {venue}. Figures are the ones on record. We don’t fill gaps with estimates.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/venue`, label: 'Open the venue dashboard' }),
  }),
  spec({
    id: 'P17', name: 'Spotlight confirmation', group: 'Promoter', priority: 'later', kind: 'transactional', wired: false,
    banner: 'promotion', needsNewBanner: false, cta: 'View the promotion',
    subject: 'Your Spotlight is on: {event}', title: 'Your Spotlight is on',
    reason: 'This is a receipt for a promotion. Billing from a verified domain comes later.',
    paragraphs: ['Spotlight is on for {event}. It runs through {endDate}. This is a record of the purchase, not a tax invoice.'],
    subjectOf: (d) => fill('Your Spotlight is on: {event}', d),
    paragraphsOf: (d) => [fill('Spotlight is on for {event}. It runs through {endDate}. This is a record of the purchase, not a tax invoice.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/promoter`, label: 'View the promotion' }),
  }),
  spec({
    id: 'P18', name: 'Pro membership confirmation', group: 'Promoter', priority: 'later', kind: 'transactional', wired: false,
    banner: 'pro', needsNewBanner: false, cta: 'Open billing',
    subject: 'You’re on VibePeep Pro', title: 'You’re on VibePeep Pro',
    reason: 'This is a receipt. A formal invoice waits for the proper domain.',
    paragraphs: ['VibePeep Pro is active through {endDate}. The amount recorded is {amount}.'],
    subjectOf: () => 'You’re on VibePeep Pro',
    paragraphsOf: (d) => [fill('VibePeep Pro is active through {endDate}. The amount recorded is {amount}.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/promoter`, label: 'Open billing' }),
  }),
  spec({
    id: 'P19', name: 'Trial ending', group: 'Promoter', priority: 'later', kind: 'transactional', wired: true,
    banner: 'pro', needsNewBanner: false, cta: 'Open billing',
    subject: 'Your VibePeep free month is ending', title: 'Your free month is ending',
    reason: 'This message is about a VibePeep trial on your account.',
    paragraphs: ['The free month ends on {when}. Cancel before then from Promoter billing if you do not want the monthly charge.'],
    subjectOf: () => 'Your VibePeep free month is ending',
    paragraphsOf: (d) => [fill('The free month ends on {when}. Cancel before then from Promoter billing if you do not want the monthly charge.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/promoter`, label: 'Open billing' }),
  }),
  spec({
    id: 'S1', name: 'Query received', group: 'Support', priority: 'launch-must', kind: 'transactional', wired: true,
    banner: 'support', needsNewBanner: false, cta: 'Visit VibePeep',
    subject: 'We’ve got your note', title: 'We’ve got your note',
    reason: 'You wrote to us from this email. This isn’t a newsletter.',
    paragraphs: ['Thanks for writing to VibePeep. This is just to say it arrived. If we can sort it with a straight answer, we’ll reply in this thread. If it needs a closer look, we’ll be in touch within 2 business days.'],
    subjectOf: () => 'We’ve got your note',
    paragraphsOf: () => ['Thanks for writing to VibePeep. This is just to say it arrived. If we can sort it with a straight answer, we’ll reply in this thread. If it needs a closer look, we’ll be in touch within 2 business days.'],
    ctaOf: () => ({ href: HOME, label: 'Visit VibePeep' }),
  }),
  spec({
    id: 'S2', name: 'Query resolved', group: 'Support', priority: 'soon', kind: 'transactional', wired: false,
    banner: 'support', needsNewBanner: false, cta: 'Visit VibePeep',
    subject: 'That’s sorted on our side', title: 'That’s sorted',
    reason: 'You wrote to us from this email.',
    paragraphs: ['We’ve closed your note. Reason: {reason}. If something’s still stuck, reply to the thread.'],
    subjectOf: () => 'That’s sorted on our side',
    paragraphsOf: (d) => [`We’ve closed your note. Reason: ${emailSentence(d.reason)}. If something’s still stuck, reply to the thread.`],
    ctaOf: () => ({ href: HOME, label: 'Visit VibePeep' }),
  }),
  spec({
    id: 'S3', name: 'Suggestion thanks', group: 'Support', priority: 'soon', kind: 'transactional', wired: false,
    banner: 'support', needsNewBanner: false, cta: 'Take a peep',
    subject: 'Thanks — we read every idea', title: 'Thanks for the idea',
    reason: 'You sent VibePeep an idea. This isn’t a newsletter.',
    paragraphs: ['Thanks for writing. We read ideas in a monthly bundle. That’s not a promise to build this one.'],
    subjectOf: () => 'Thanks — we read every idea',
    paragraphsOf: () => ['Thanks for writing. We read ideas in a monthly bundle. That’s not a promise to build this one.'],
    ctaOf: () => ({ href: HOME, label: 'Take a peep' }),
  }),
  spec({
    id: 'S4', name: 'Report thank-you', group: 'Support', priority: 'soon', kind: 'transactional', wired: false,
    banner: 'support', needsNewBanner: false, cta: 'Back to VibePeep',
    subject: 'Thanks for the heads-up', title: 'Thanks for the heads-up',
    reason: 'You reported a listing. This isn’t a newsletter.',
    paragraphs: ['Thanks for the report. We’ll check the listing. This email doesn’t promise a particular outcome.'],
    subjectOf: () => 'Thanks for the heads-up',
    paragraphsOf: () => ['Thanks for the report. We’ll check the listing. This email doesn’t promise a particular outcome.'],
    ctaOf: () => ({ href: HOME, label: 'Back to VibePeep' }),
  }),
  spec({
    id: 'B1', name: 'Payment receipt', group: 'Billing', priority: 'later', kind: 'transactional', wired: false,
    banner: 'billing', needsNewBanner: false, cta: 'View billing',
    subject: 'Your VibePeep receipt', title: 'Your receipt',
    reason: 'This is a receipt for a VibePeep payment. A tax invoice waits for the proper domain.',
    paragraphs: ['We recorded a payment of {amount}. This email is the receipt. It is not yet a tax invoice.'],
    subjectOf: () => 'Your VibePeep receipt',
    paragraphsOf: (d) => [fill('We recorded a payment of {amount}. This email is the receipt. It is not yet a tax invoice.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/promoter`, label: 'View billing' }),
  }),
  spec({
    id: 'B2', name: 'Payment failed', group: 'Billing', priority: 'later', kind: 'transactional', wired: false,
    banner: 'billing', needsNewBanner: false, cta: 'Update billing',
    subject: 'We couldn’t take that payment', title: 'That payment didn’t go through',
    reason: 'This is about a VibePeep payment.',
    paragraphs: ['The card for {amount} didn’t go through. Nothing new was switched on. You can update the card from billing.'],
    subjectOf: () => 'We couldn’t take that payment',
    paragraphsOf: (d) => [fill('The card for {amount} didn’t go through. Nothing new was switched on. You can update the card from billing.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/promoter`, label: 'Update billing' }),
  }),
  spec({
    id: 'B3', name: 'Subscription cancelled', group: 'Billing', priority: 'later', kind: 'transactional', wired: false,
    banner: 'billing', needsNewBanner: false, cta: 'View billing',
    subject: 'Your VibePeep plan is cancelled', title: 'Your plan is cancelled',
    reason: 'This confirms a cancellation on your VibePeep account.',
    paragraphs: ['The plan is cancelled. Access continues through {endDate} where a paid period was already in progress.'],
    subjectOf: () => 'Your VibePeep plan is cancelled',
    paragraphsOf: (d) => [fill('The plan is cancelled. Access continues through {endDate} where a paid period was already in progress.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/promoter`, label: 'View billing' }),
  }),
  spec({
    id: 'B4', name: 'Refund issued', group: 'Billing', priority: 'later', kind: 'transactional', wired: false,
    banner: 'billing', needsNewBanner: false, cta: 'Read about refunds',
    subject: 'Your VibePeep refund is on the way', title: 'Your refund is on the way',
    reason: 'This confirms a refund.',
    paragraphs: ['A refund of {amount} is on the way to the original payment method. Banks take a few days to show it.'],
    subjectOf: () => 'Your VibePeep refund is on the way',
    paragraphsOf: (d) => [fill('A refund of {amount} is on the way to the original payment method. Banks take a few days to show it.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/refunds`, label: 'Read about refunds' }),
  }),
  spec({
    id: 'B5', name: 'Card expiring', group: 'Billing', priority: 'later', kind: 'transactional', wired: false,
    banner: 'billing', needsNewBanner: false, cta: 'Update the card',
    subject: 'Your card is about to expire', title: 'Your card is about to expire',
    reason: 'This is about the card stored for VibePeep billing.',
    paragraphs: ['The card we have on file expires soon. Update it before the next renewal so the plan doesn’t stop.'],
    subjectOf: () => 'Your card is about to expire',
    paragraphsOf: () => ['The card we have on file expires soon. Update it before the next renewal so the plan doesn’t stop.'],
    ctaOf: (d) => ({ href: d.href || `${HOME}/promoter`, label: 'Update the card' }),
  }),
  spec({
    id: 'B6', name: 'Invoice', group: 'Billing', priority: 'later', kind: 'transactional', wired: false,
    banner: 'billing', needsNewBanner: false, cta: 'View the invoice',
    subject: 'Invoice from VibePeep', title: 'Your invoice',
    reason: 'Formal tax invoices wait until the legal entity is in place. This copy is the record we can send today.',
    paragraphs: ['This is the invoice record for {amount}. A formal tax invoice, with the legal entity, comes once that entity is registered.'],
    subjectOf: () => 'Invoice from VibePeep',
    paragraphsOf: (d) => [fill('This is the invoice record for {amount}. A formal tax invoice, with the legal entity, comes once that entity is registered.', d)],
    ctaOf: (d) => ({ href: d.href || `${HOME}/promoter`, label: 'View the invoice' }),
  }),
]

function merged(data?: MailData): MailData {
  const name = data?.name?.trim() || SAMPLE_MAIL.name
  return { ...SAMPLE_MAIL, ...data, name: name || 'there' }
}

const PREHEADER: Record<TemplateId, string> = {
  A1: 'One link, good for a day, confirms this inbox is yours.',
  A2: 'One-time sign-in. Ignore it if you didn’t ask for a link.',
  A3: 'One link, good for an hour, to choose a new password.',
  A4: 'If you didn’t change it, reset the password from here.',
  A5: 'If you didn’t change the email, contact us straight away.',
  A6: 'If this sign-in wasn’t you, reset your password.',
  A7: 'The account is closed. Saved events on this inbox are gone.',
  A8: 'Your export is ready. The download link is inside.',
  L1: 'The terms changed. The short version is in this note.',
  L2: 'The privacy policy changed. Here’s what that means for you.',
  L3: 'A small change to how cookies work on VibePeep.',
  C1: 'Your account is ready. Go find something good tonight.',
  C2: 'A short list of what’s on, picked for your city.',
  C3: 'Saved events, plus new listings in the cities you follow.',
  C4: 'One of your saved events is coming up soon.',
  C5: 'The time on a saved event moved. The new one is inside.',
  C6: 'A saved event was cancelled. The details are inside.',
  C7: 'A saved event has a new date. The details are inside.',
  C8: 'A stop on your Itinerary is happening tonight.',
  C9: 'Someone invited you onto a plan. Open it when you’re free.',
  C10: 'Your group is waiting on a vote for this plan.',
  C11: 'It’s been a while. There’s a fresh shortlist when you want it.',
  P1: 'The six-digit code for your listing is inside this note.',
  P2: 'A person will check the listing before it goes public.',
  P3: 'Neighbours can peep the listing now.',
  P4: 'It needs a change before it can go on VibePeep.',
  P5: 'The listing is no longer on VibePeep.',
  P6: 'We’ve got the claim. You’ll hear when it’s decided.',
  P7: 'You can update the listing from your promoter tools.',
  P8: 'The claim didn’t go through. The reason is inside.',
  P9: 'The six-digit code for this venue is inside this note.',
  P10: 'You can edit the page, check listings and add staff.',
  P11: 'The venue claim didn’t go through. The reason is inside.',
  P12: 'You’ve been added as staff. The dashboard link is inside.',
  P13: 'The listing stays up while we check the venue report.',
  P14: 'The tick means you manage the listing. It isn’t a check of the event.',
  P15: 'Views, clicks and saves from the week, as we recorded them.',
  P16: 'Views, saves, itinerary adds and ticket clicks, as recorded.',
  P17: 'Spotlight is on. This note is the purchase record.',
  P18: 'Pro is active. This note is the purchase record.',
  P19: 'The free month ends soon. Cancel from billing if you want to.',
  S1: 'It arrived. We’ll reply in this thread if a straight answer will do.',
  S2: 'We’ve closed the note. Reply if something’s still stuck.',
  S3: 'We read ideas monthly. This isn’t a promise to build it.',
  S4: 'We’ll check the listing. This isn’t a promised outcome.',
  B1: 'The payment is recorded. This is a receipt, not a tax invoice.',
  B2: 'The card didn’t go through. Nothing new was switched on.',
  B3: 'The plan is cancelled. Access runs to the end of the paid period.',
  B4: 'The refund is on its way back to the original payment method.',
  B5: 'Update the card before the next renewal so the plan continues.',
  B6: 'The amount on record. A tax invoice waits for the legal entity.',
}

function listingExtras(row: Spec, data: MailData): string {
  if (row.id !== 'P2' && row.id !== 'P3') return ''
  const listing = data.href || HOME
  const manage = data.manageHref || `${HOME}/local/manage/sample`
  const poster = data.posterHref || `${HOME}/local/poster/sample`
  return `<p style="margin:12px 0 0;">${emailLink(manage, 'Edit, postpone or take it down')}</p>
<p style="margin:8px 0;">${emailLink(poster, 'Printable poster')}</p>
<p class="mu" style="margin:0;font-size:14px;color:${EMAIL_C.muted};">Listing: ${emailLink(listing, 'Open the listing page')}</p>`
}

function shell(row: Spec, data: MailData): { subject: string; html: string; text: string } {
  const subject = row.subjectOf(data)
  const title = fill(row.title, data)
  const paragraphs = row.paragraphsOf(data).filter(Boolean)
  const bullets = row.bulletsOf?.(data) ?? []
  const cta = row.ctaOf?.(data)
  const unsub = row.kind === 'transactional' ? undefined : (data.unsubscribeHref || `${HOME}/unsubscribe`)
  const manage = row.kind === 'transactional' ? `${HOME}/account` : (data.manageHref || `${HOME}/account`)
  const preheader = PREHEADER[row.id]
  const code = (row.id === 'P1' || row.id === 'P9') && data.code ? emailCode(data.code, 30) : ''
  const paste = cta && (row.id === 'A1' || row.id === 'A2' || row.id === 'A3') ? emailPasteLink(cta.href) : ''
  const body = [
    row.kicker ? `<p class="accent" style="margin:0 0 8px;font-size:12px;letter-spacing:0.8px;font-weight:800;text-transform:uppercase;color:${EMAIL_C.accentText};">${emailEscape(row.kicker)}</p>` : '',
    `<h1 class="tx" style="margin:0 0 16px;font-size:26px;line-height:1.2;font-weight:800;color:${EMAIL_C.ink};">${emailEscape(title)}</h1>`,
    ...paragraphs.map((line) => `<p class="tx" style="margin:0 0 16px;color:${EMAIL_C.ink};">${emailEscape(line)}</p>`),
    code,
    bullets.length ? `<ul style="margin:0 0 16px;padding-left:18px;">${bullets.map((item) => `<li class="tx" style="margin:0 0 8px;color:${EMAIL_C.ink};">${emailEscape(item)}</li>`).join('')}</ul>` : '',
    cta ? emailButton(cta.href, cta.label) : '',
    paste,
    listingExtras(row, data),
  ].join('')
  const html = emailDocument({
    title,
    preheader,
    rows: emailBodyCell(body),
    homeHref: HOME,
    manageHref: manage,
    unsubscribeHref: unsub,
    banner: row.banner,
  })
  const text = [
    title,
    '',
    preheader,
    '',
    ...paragraphs,
    code ? `Code: ${data.code}` : '',
    ...bullets.map((item) => `- ${item}`),
    cta ? `${cta.label}: ${cta.href}` : '',
    row.reason || '',
    `Privacy: ${HOME}/privacy`,
    unsub ? `Unsubscribe: ${unsub}` : '',
    manage ? `Manage preferences: ${manage}` : '',
    unsub ? EMAIL_OPT_OUT_LINE : '',
    emailPlainFooter(HOME),
  ].filter((line) => line !== undefined && line !== '').join('\n')
  return { subject, html, text }
}

function sampleEvent(over: Partial<NlEvent> & { id: string; title: string }): NlEvent {
  return {
    description: 'A night out.',
    date: new Date('2026-11-07T00:00:00.000Z'),
    endDate: null,
    time: '19:30',
    endTime: null,
    venueName: 'The Imperial',
    venueAddress: '1 King St',
    suburb: 'Newtown',
    city: 'Sydney',
    category: 'Music',
    subTags: [],
    isFree: false,
    isLGBTI: false,
    price: null,
    priceMin: null,
    priceMax: null,
    feesIncluded: false,
    imageUrl: null,
    ticketUrl: `${HOME}/events/sample`,
    source: 'ticketmaster',
    sources: ['ticketmaster'],
    status: 'SCHEDULED',
    statusSource: null,
    lastVerifiedAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    latitude: -33.9,
    longitude: 151.18,
    ageRestriction: null,
    recurrence: null,
    duplicateOfId: null,
    views: 3,
    ticketClicks: 1,
    imageAsset: null,
    _count: { savedBy: 2, attendees: 1 },
    score: 20,
    why: ['interest'],
    whyLine: 'Because you follow Music',
    travel: null,
    hasImage: false,
    popularity: 4,
    ...over,
  } as NlEvent
}

function sampleNewsletter(): { subject: string; html: string; text: string } {
  const hero = sampleEvent({ id: 'hero1', title: 'Friday night at The Imperial', price: '$28', priceMin: 28, priceMax: 28 })
  const slot = (ev: NlEvent, img: string | null = null): Slot => ({ ev, img, blurb: `${ev.category} at ${ev.venueName}.` })
  const input: RenderInput = {
    ctx: { sendId: 'preview', edition: 'daily', issueDate: '2026-11-07', city: 'Sydney' },
    userId: 'preview',
    email: 'sam@example.com',
    editionKey: 'daily',
    city: 'Sydney',
    from: new Date('2026-11-07T00:00:00.000Z'),
    to: new Date('2026-11-08T00:00:00.000Z'),
    greeting: 'Hey Sam,',
    intro: 'A short list for tonight. Times are as listed, like 7:30 pm.',
    preview: 'Hey Sam — a short list for tonight.',
    subject: "Your couch can wait. Sydney can't.",
    cta: 'A',
    nearTitle: 'On tonight',
    becauseTitle: null,
    reminderOptIn: true,
    hero: slot(hero, `${HOME}/placeholders/music/hero.webp`),
    weekend: [],
    because: [],
    saved: [],
    free: [slot(sampleEvent({ id: 'free1', title: 'Late market', category: 'Community', isFree: true, price: 'Free', priceMin: 0 }), `${HOME}/placeholders/community/card.webp`)],
    popular: [],
    sponsored: [],
    sponsoredPos: 'end',
    trackOpens: false,
    trackClicks: false,
  }
  return { subject: input.subject, html: renderHtml(input), text: `${input.greeting}\n${input.intro}\n${EMAIL_ADDRESS}` }
}

function sampleReminder(): { subject: string; html: string; text: string } {
  const mail = composeWatchEmail({
    saved: [{
      id: 'keeper',
      title: 'Friday night at The Imperial',
      when: 'Sat 7 Nov · 7:30 pm',
      venue: 'The Imperial, Newtown',
      href: `${HOME}/events/sample`,
      category: 'Music',
    }],
    matches: [],
    reminders: true,
    homeHref: HOME,
    manageHref: `${HOME}/account`,
    unsubscribeHref: `${HOME}/unsubscribe`,
  })
  if (!mail) return shell(SPECS.find((row) => row.id === 'C4')!, merged())
  return mail
}

export function catalogueSpecs(): Spec[] {
  return SPECS
}

export function catalogueEntry(id: string): CatalogueEntry | null {
  const row = SPECS.find((item) => item.id === id)
  if (!row) return null
  const { subjectOf: _s, paragraphsOf: _p, ctaOf: _c, bulletsOf: _b, composer: _o, ...entry } = row
  return entry
}

export function renderTemplate(id: TemplateId, data?: MailData): { subject: string; html: string; text: string } {
  const row = SPECS.find((item) => item.id === id)
  if (!row) throw new Error(`Unknown email template ${id}`)
  if (row.composer === 'newsletter') return sampleNewsletter()
  if (row.composer === 'watch') return sampleWatchEmail()
  if (row.composer === 'reminder') return sampleReminder()
  if (id === 'P15') return previewPromoterReport()
  if (id === 'P16') return previewVenueMonthly()
  const filled = merged(data)
  if (id === 'C1' && !data?.name) filled.name = 'there'
  return shell(row, filled)
}

export function templateMailHeaders(id: TemplateId): Record<string, string> {
  const row = SPECS.find((item) => item.id === id)
  if (!row || row.kind === 'transactional') return listUnsubscribeHeaders({ kind: 'transactional' })
  const path = row.id === 'P16'
    ? '/api/venues/report/unsubscribe'
    : row.kind === 'report'
      ? '/api/promoter/report/unsubscribe'
      : '/api/nl/unsubscribe'
  return listUnsubscribeHeaders({ kind: row.kind, unsubscribeUrl: `${HOME}${path}` })
}

export const CATALOGUE_IDS = SPECS.map((row) => row.id)
