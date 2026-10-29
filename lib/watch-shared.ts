import { emailLockup } from '@/lib/email-brand'
import { cityDef } from '@/lib/cities'
import { hhmm, zonedWallTime } from '@/lib/zoned-time'

export const MAIL_INTERVAL_MS: Record<string, number> = {
  daily: 22 * 3600e3,
  weekly: 6.5 * 86400e3,
  monthly: 29 * 86400e3,
}

export function mailDue(last: Date | null | undefined, frequency: string | null | undefined, now = Date.now()): boolean {
  if (!last) return true
  const interval = MAIL_INTERVAL_MS[(frequency ?? 'weekly').toLowerCase()] ?? MAIL_INTERVAL_MS.weekly
  return now - last.getTime() >= interval
}

/**
 * True when a saved event should get one reminder email.
 * Timed events: start is 2–36 hours away.
 * Untimed events: local noon on the event date is 2–30 hours away, so the note lands the day before or that morning.
 */
export function inReminderWindow(dateKey: string, time: string | null | undefined, city: string | null | undefined, now = new Date()): boolean {
  const tz = cityDef(city).tz
  const clock = hhmm(time)
  const start = zonedWallTime(dateKey, clock ?? '12:00', tz)
  const hours = (start.getTime() - now.getTime()) / 3600000
  if (clock) return hours >= 2 && hours <= 36
  return hours >= 2 && hours <= 30
}

export type MailEvent = { id: string; title: string; when: string; venue: string; href: string }

/** Builds the watchlist email. Returns null when there is nothing honest to send. */
export function composeWatchEmail(input: { saved: MailEvent[]; matches: MailEvent[]; reminders?: boolean }): { subject: string; html: string; text: string } | null {
  if (!input.saved.length && !input.matches.length) return null
  const subject = input.reminders ? 'A saved VibePeep event is coming up' : 'Your VibePeep watchlist'
  const blocks: string[] = []
  const text: string[] = [subject, '']
  const section = (heading: string, rows: MailEvent[]) => {
    if (!rows.length) return
    text.push(heading)
    blocks.push(`<h2 style="font-size:16px;margin:20px 0 8px;">${escape(heading)}</h2><ul style="padding-left:18px;">`)
    for (const row of rows) {
      text.push(`- ${row.title} — ${row.when} — ${row.venue} — ${row.href}`)
      blocks.push(`<li style="margin:0 0 8px;"><a href="${escape(row.href)}">${escape(row.title)}</a><br><span style="color:#444;">${escape(row.when)} · ${escape(row.venue)}</span></li>`)
    }
    blocks.push('</ul>')
    text.push('')
  }
  section(input.reminders ? 'Coming up from your keepers' : 'Saved and still ahead', input.saved)
  section('New listings that match what you follow', input.matches)
  text.push('Times and prices can change. Confirm with the organiser before you go.')
  text.push('Manage saves, follows and reminders at My VibePeep.')
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111;">
    ${emailLockup()}
    ${blocks.join('')}
    <p style="color:#555;font-size:13px;">Times and prices can change. Confirm with the organiser before you go. VibePeep does not sell tickets and does not show live availability.</p>
    <p style="color:#555;font-size:12px;">You asked for these notes. Turn them off any time from My VibePeep or My account.</p>
  </div>`
  return { subject, html, text: text.join('\n') }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
