import type { BoardRange } from '@/lib/listing-window'

/** Spoken clock. Start and finish only, joined with “to”. */
export function listClockLabel(when: BoardRange): string {
  if (when.hm === 'All day' || when.hm === '--:--') return when.label
  const end = when.endLine?.replace(/^–\s*/, '').trim() ?? ''
  const start = `${when.hm} ${when.ampm}`.trim()
  if (!end) return start
  const note = when.endNote === '+1' ? ', next day' : when.endNote ? `, ${when.endNote}` : ''
  return `${start} to ${end}${note}`
}

/** Place line. A later-day finish keeps its date here so the clock column stays one width. */
export function listPlaceLine(place: string, endNote?: string | null): string {
  if (!endNote || endNote === '+1') return place
  return [place, endNote].filter(Boolean).join(' · ')
}

/**
 * Start or finish, right-aligned on one edge.
 * The am/pm sits in a fixed column so 9:00 and 10:00 share that edge.
 */
export function ListClock({ when, part }: { when: BoardRange; part: 'start' | 'end' }) {
  if (part === 'end') {
    const raw = when.endLine?.replace(/^–\s*/, '').trim() ?? ''
    if (!raw) return null
    const space = raw.lastIndexOf(' ')
    const hm = space > 0 ? raw.slice(0, space) : raw
    const ampm = space > 0 ? raw.slice(space + 1) : ''
    return (
      <span className="vp-clock vp-clock-end" data-part="end">
        <span className="vp-clock-hm">{hm}</span>
        <span className="vp-clock-ap">
          {ampm}
          {when.endNote === '+1' ? <sup className="vp-clock-note">+1</sup> : null}
        </span>
      </span>
    )
  }
  if (!when.ampm) {
    return <span className="vp-clock vp-clock-start is-plain" data-part="start">{when.hm}</span>
  }
  return (
    <span className="vp-clock vp-clock-start" data-part="start">
      <span className="vp-clock-hm">{when.hm}</span>
      <span className="vp-clock-ap">{when.ampm}</span>
    </span>
  )
}
