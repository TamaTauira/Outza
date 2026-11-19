import { cityDef } from '@/lib/cities'
import { hhmm } from '@/lib/zoned-time'

export type IcsEvent = {
  id: string
  title: string
  date: string | Date
  endDate?: string | Date | null
  time?: string | null
  endTime?: string | null
  venueName?: string | null
  city?: string | null
  url?: string | null
}

function dateKey(value: string | Date): string {
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10).replace(/-/g, '')
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

/**
 * RFC 5545 folding: each physical line is at most 75 UTF-8 octets.
 * Continuation lines start with one space, which counts toward that 75.
 * A multibyte character, including a surrogate pair encoded as one code point, stays on one line.
 */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let offset = 0
  let budget = 75
  while (offset < bytes.length) {
    let end = Math.min(bytes.length, offset + budget)
    if (end < bytes.length) {
      while (end > offset && (bytes[end] & 0xc0) === 0x80) end -= 1
      if (end === offset) {
        end = offset + 1
        while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end += 1
      }
    }
    const chunk = bytes.subarray(offset, end).toString('utf8')
    parts.push(parts.length ? ` ${chunk}` : chunk)
    offset = end
    budget = 74
  }
  return parts.join('\r\n')
}

/** Calendar file for saved events. Times stay in the event city's timezone. No live availability. */
export function eventsToIcs(events: IcsEvent[], opts: { calendarName?: string; stamp?: Date } = {}): string {
  const stamp = (opts.stamp ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VibePeep//My VibePeep//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(opts.calendarName ?? 'My VibePeep')}`,
  ]
  for (const ev of events) {
    const startKey = dateKey(ev.date)
    const endKey = dateKey(ev.endDate ?? ev.date)
    const tz = cityDef(ev.city).tz
    const start = hhmm(ev.time)
    const end = hhmm(ev.endTime)
    const dtStart = start ? `DTSTART;TZID=${tz}:${startKey}T${start.replace(':', '')}00` : `DTSTART;VALUE=DATE:${startKey}`
    let dtEnd: string
    let endDay = endKey
    if (start && end && endDay === startKey && end < start) {
      const next = new Date(`${endDay.slice(0, 4)}-${endDay.slice(4, 6)}-${endDay.slice(6, 8)}T00:00:00Z`)
      next.setUTCDate(next.getUTCDate() + 1)
      endDay = next.toISOString().slice(0, 10).replace(/-/g, '')
    }
    if (start && end) dtEnd = `DTEND;TZID=${tz}:${endDay}T${end.replace(':', '')}00`
    else if (start) dtEnd = 'DURATION:PT2H'
    else {
      const next = new Date(`${endKey.slice(0, 4)}-${endKey.slice(4, 6)}-${endKey.slice(6, 8)}T00:00:00Z`)
      next.setUTCDate(next.getUTCDate() + 1)
      const nextKey = next.toISOString().slice(0, 10).replace(/-/g, '')
      dtEnd = `DTEND;VALUE=DATE:${nextKey}`
    }
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icsEscape(ev.id)}@vibepeep`,
      `DTSTAMP:${stamp}`,
      dtStart,
      dtEnd,
      `SUMMARY:${icsEscape(ev.title)}`,
      `LOCATION:${icsEscape([ev.venueName, ev.city].filter(Boolean).join(', '))}`,
      ...(ev.url ? [`URL:${icsEscape(ev.url)}`] : []),
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}

export const ITINERARY_ICS_FILENAME = 'vibepeep-itinerary.ics'
export const SAVED_ICS_FILENAME = 'vibepeep-saved.ics'
