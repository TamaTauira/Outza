// Minimal xlsx reader (zip + sheet XML). Enough for the TRA workbooks, which are plain grids.
import { inflateRawSync } from 'zlib'

const xml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  let o = 0
  while (o + 30 <= buf.length && buf.readUInt32LE(o) === 0x04034b50) {
    const flags = buf.readUInt16LE(o + 6)
    const method = buf.readUInt16LE(o + 8)
    let compSize = buf.readUInt32LE(o + 18)
    const nameLen = buf.readUInt16LE(o + 26)
    const extraLen = buf.readUInt16LE(o + 28)
    const name = buf.subarray(o + 30, o + 30 + nameLen).toString('utf8')
    const start = o + 30 + nameLen + extraLen
    if ((flags & 0x8) !== 0 && compSize === 0) {
      const next = buf.indexOf(Buffer.from([0x50, 0x4b]), start + 4)
      compSize = (next === -1 ? buf.length : next) - start
    }
    const comp = buf.subarray(start, start + compSize)
    const data = method === 0 ? Buffer.from(comp) : method === 8 ? inflateRawSync(comp) : Buffer.alloc(0)
    if (name && !name.endsWith('/')) out.set(name, data)
    o = start + compSize
    if ((flags & 0x8) !== 0) {
      if (buf.readUInt32LE(o) === 0x08074b50) o += 16
      else if (buf.readUInt32LE(o) !== 0x04034b50 && buf.readUInt32LE(o) !== 0x02014b50) o += 12
    }
  }
  return out
}

function sharedStrings(xmlText: string): string[] {
  const out: string[] = []
  for (const si of xmlText.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) ?? []) {
    const parts = [...si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xml(m[1]))
    out.push(parts.join(''))
  }
  return out
}

function colIndex(ref: string) {
  let n = 0
  for (const c of ref) {
    if (c < 'A' || c > 'Z') break
    n = n * 26 + (c.charCodeAt(0) - 64)
  }
  return n - 1
}

/** One worksheet's cells as a dense grid of strings. Empty rows are dropped. */
export function rowsFromSheetXml(sheetXml: string, strings: string[]): string[][] {
  const byRow = new Map<number, string[]>()
  for (const m of sheetXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1]
    const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1]
    if (!ref) continue
    const rowNo = Number(attrs.match(/\br="[A-Z]+(\d+)"/)?.[1] ?? 0)
    const kind = attrs.match(/\bt="([^"]+)"/)?.[1] ?? ''
    const raw = m[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? (kind === 'inlineStr' ? (m[2]?.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '') : '')
    let value = ''
    if (kind === 's') value = strings[Number(raw)] ?? ''
    else if (kind === 'inlineStr') value = xml(raw)
    else value = raw
    const row = byRow.get(rowNo) ?? []
    row[colIndex(ref)] = value.trim()
    byRow.set(rowNo, row)
  }
  return [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row.map((c) => c ?? '')).filter((row) => row.some((c) => c !== ''))
}

export function readXlsxSheets(buf: Buffer): Record<string, string[][]> {
  const files = unzip(buf)
  const workbook = files.get('xl/workbook.xml')?.toString('utf8') ?? ''
  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? ''
  const strings = sharedStrings(files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '')
  const idToTarget = new Map<string, string>()
  for (const m of rels.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)) idToTarget.set(m[1], m[2])
  const out: Record<string, string[][]> = {}
  for (const m of workbook.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/g)) {
    const target = idToTarget.get(m[2])
    if (!target) continue
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\//, '')}`
    const sheet = files.get(path)?.toString('utf8')
    if (!sheet) continue
    out[xml(m[1])] = rowsFromSheetXml(sheet, strings)
  }
  return out
}
