import { cache } from 'react'
import { prisma } from '@/lib/db'
import { cityDef } from '@/lib/cities'
import { addDaysStr, localPath, occurrences, recurrenceLabel, todayIn, MAX_AHEAD_DAYS } from '@/lib/local-shared'
import { listingPicture } from '@/lib/local-images'
import { publicUrl } from '@/lib/s3'
import { imageAssetSelect, type ClientImage } from '@/lib/images/spec'
import type { LocalDetail } from './[slug]/local-detail-client'

/** Loads a live (approved, not expired) listing from "/local/<slug>-<id>" and its upcoming dates. */
export const loadLocalListing = cache(async (param: string): Promise<LocalDetail | null> => {
  const id = decodeURIComponent(param).split('-').pop() ?? ''
  if (!id) return null
  const l = await prisma.localListing.findFirst({
    where: { id, status: 'APPROVED', expiresAt: { gte: new Date() } },
    select: { id: true, title: true, category: true, description: true, address: true, suburb: true, postcode: true, city: true, lat: true, lng: true, addressVerified: true, startDate: true, endDate: true, startTime: true, endTime: true, recurrence: true, recurUntil: true, priceNote: true, organiserName: true, websiteUrl: true, sourceName: true, imagePath: true, sourceImageUrl: true, imageAsset: { select: imageAssetSelect }, createdAt: true },
  })
  if (!l) return null
  const today = todayIn(cityDef(l.city).tz)
  const upcoming = occurrences(l, today, addDaysStr(today, MAX_AHEAD_DAYS))
  if (!upcoming.length) return null
  const { createdAt, imagePath, sourceImageUrl, imageAsset, ...rest } = l
  return { ...rest, imageUrl: listingPicture(imagePath, sourceImageUrl, publicUrl), imageAsset: (imageAsset as ClientImage | null) ?? null, listedAt: createdAt.toISOString(), upcoming, schedule: recurrenceLabel(l), recurring: l.recurrence !== 'NONE' }
})

/** Old links to a repeat copy of a listing go to the one we keep. */
export async function canonicalLocalListing(param: string) {
  const id = decodeURIComponent(param).split('-').pop() ?? ''
  const dup = id ? await prisma.localListing.findFirst({ where: { id, duplicateOfId: { not: null } }, select: { duplicateOfId: true } }) : null
  if (!dup?.duplicateOfId) return null
  const kept = await prisma.localListing.findFirst({ where: { id: dup.duplicateOfId, status: 'APPROVED', expiresAt: { gte: new Date() } }, select: { id: true, title: true } })
  return kept ? localPath(kept) : null
}
