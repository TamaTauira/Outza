import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isEdition } from '@/lib/daily-editions'
import { synthesizeSpeech } from '@/lib/daily-speech'
import { dailyAudioPlaybackEnabled } from '@/lib/feature-flags'
import { publicUrl, putObject, storagePath } from '@/lib/s3'
import { citySlug } from '@/lib/seo'

export const dynamic = 'force-dynamic'

/** Serves the cached city recording. The script is the shared edition, never a personal one. */
export async function GET(req: NextRequest) {
  if (!dailyAudioPlaybackEnabled()) return NextResponse.json({ error: 'Playback is off' }, { status: 404 })
  const city = req.nextUrl.searchParams.get('city') ?? ''
  const edition = req.nextUrl.searchParams.get('edition') ?? ''
  const day = req.nextUrl.searchParams.get('day') ?? ''
  if (!city || !isEdition(edition) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: 'Unknown briefing' }, { status: 400 })
  }
  const row = await prisma.dailyBriefing.findUnique({ where: { city_edition_day: { city, edition, day } } })
  if (!row?.spoken) return NextResponse.json({ error: 'That edition is not ready' }, { status: 404 })
  if (row.audioStatus === 'READY' && row.audioPath) {
    return NextResponse.redirect(publicUrl(row.audioPath))
  }
  const bytes = await synthesizeSpeech(row.spoken)
  if (!bytes) return NextResponse.json({ error: 'The recording could not be made' }, { status: 503 })
  const path = storagePath(`daily/${citySlug(city)}/${edition}/${day}-${row.contentHash}.mp3`)
  await putObject(path, bytes, 'audio/mpeg')
  await prisma.dailyBriefing.update({ where: { id: row.id }, data: { audioPath: path, audioStatus: 'READY' } })
  return NextResponse.redirect(publicUrl(path))
}
