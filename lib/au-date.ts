const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const AU_DAY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

function validIso(iso: string): boolean {
  const match = ISO_DAY.exec(iso)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** dd/mm/yyyy for a stored ISO day. Empty when the value is not a real day. */
export function isoToAu(iso: string): string {
  const day = iso.slice(0, 10)
  if (!validIso(day)) return ''
  const [, year, month, date] = ISO_DAY.exec(day) as RegExpExecArray
  return `${date}/${month}/${year}`
}

/** Parse a typed dd/mm/yyyy (or an already-ISO day) into YYYY-MM-DD. */
export function auToIso(value: string): string | null {
  const text = value.trim()
  if (!text) return null
  if (ISO_DAY.test(text)) return validIso(text) ? text : null
  const match = AU_DAY.exec(text)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return validIso(iso) ? iso : null
}
