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

function fold(line: string): string {
  if (line.length <= 73) return line
  const parts = [line.slice(0, 73)]
  let rest = line.slice(73)
  while (rest.length) {
    parts.push(` ${rest.slice(0, 72)}`)
    rest = rest.slice(72)
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
    if (start && end) dtEnd = `DTEND;TZID=${tz}:${endKey}T${end.replace(':', '')}00`
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
  return lines.map(fold).join('\r\n') + '\r\n'
}
