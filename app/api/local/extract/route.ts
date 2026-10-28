import { NextResponse } from 'next/server'
import { cityDef } from '@/lib/cities'
import { todayIn } from '@/lib/local-shared'
import { ExtractError, REQUIRED_FIELDS, extractListing, readDocx, readPage } from '@/lib/local-extract'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

const MAX_BYTES = 10 * 1024 * 1024

/** POST multipart: `url` (public web page) or `file` (PDF / Word .docx / .txt), plus `city` for date context. */
export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Please paste a link or attach a document.' }, { status: 400 })
    const today = todayIn(cityDef(String(form.get('city') ?? 'Sydney')).tz)
    const url = String(form.get('url') ?? '').trim()
    const file = form.get('file')

    let fields
    let sourceUrl = ''
    if (file && typeof file !== 'string') {
      if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That file is over 10 MB. Please upload a smaller one.' }, { status: 400 })
      const name = file.name.toLowerCase()
      const buf = Buffer.from(await file.arrayBuffer())
      if (name.endsWith('.pdf') || file.type === 'application/pdf') {
        fields = await extractListing({ pdfBase64: buf.toString('base64'), filename: file.name }, today)
      } else if (name.endsWith('.docx')) {
        const text = (await readDocx(buf).catch(() => '')).trim()
        if (!text) return NextResponse.json({ error: 'We couldn’t read any text in that Word document.' }, { status: 400 })
        fields = await extractListing({ text: text.slice(0, 24000) }, today)
      } else if (name.endsWith('.txt')) {
        fields = await extractListing({ text: buf.toString('utf8').slice(0, 24000) }, today)
      } else if (name.endsWith('.doc')) {
        return NextResponse.json({ error: 'Older .doc files can’t be read. Please save it as .docx or PDF and try again.' }, { status: 400 })
      } else {
        return NextResponse.json({ error: 'Please upload a PDF or Word (.docx) document.' }, { status: 400 })
      }
    } else if (url) {
      const page = await readPage(url)
      sourceUrl = page.url
      fields = await extractListing({ text: page.text }, today)
      if (!fields.websiteUrl) fields.websiteUrl = sourceUrl
    } else {
      return NextResponse.json({ error: 'Please paste a link or attach a document.' }, { status: 400 })
    }

    const found = Object.entries(fields).filter(([, v]) => v).map(([k]) => k)
    if (!found.length) return NextResponse.json({ error: 'We couldn’t find any event details in that source. Please fill in the form manually.' }, { status: 422 })
    const missing = REQUIRED_FIELDS.filter(([k]) => !fields[k]).map(([, label]) => label)
    return NextResponse.json({ fields, found, missing })
  } catch (err: any) {
    if (err instanceof ExtractError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('Local import failed:', err?.message)
    return NextResponse.json({ error: 'Import failed. Please try again or fill in the form manually.' }, { status: 500 })
  }
}
