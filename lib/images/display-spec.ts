/** Client-safe display-image contract. Derivatives are 480/960/1440, never upscaled. */

import { storedPhotoIsLowQuality } from './listing-photo'

export const DISPLAY_WIDTHS = [480, 960, 1440] as const
export const DISPLAY_VERSION = 1

export interface DisplayManifest {
  v: number
  pending?: boolean
  failed?: boolean
  attempts?: number
  hash?: string
  base?: string
  widths?: number[]
  /** Source artwork is below the card minimum. The page shows holding art instead. */
  lowQuality?: boolean
}

export interface EventPicture {
  width: number | null
  height: number | null
  color: string | null
  blur: string | null
  base: string
  widths: number[]
  /** True when the stored source is too small to show on a card. */
  lowQuality: boolean
}

/** Marks a row whose source image just changed. The resize cron picks these up and ignores older rows. */
export const displayPendingData = {
  imageWidth: null,
  imageHeight: null,
  imageColor: null,
  imageBlur: null,
  imageDisplay: { v: DISPLAY_VERSION, pending: true, attempts: 0 } satisfies DisplayManifest,
}

export const eventPictureSelect = {
  imageWidth: true,
  imageHeight: true,
  imageColor: true,
  imageBlur: true,
  imageDisplay: true,
} as const

/** Widths we can honestly serve. A source narrower than 480 stays at its own width. */
export function displayWidths(naturalWidth: number): number[] {
  if (!Number.isFinite(naturalWidth) || naturalWidth < 32) return []
  const fit = DISPLAY_WIDTHS.filter((w) => w <= naturalWidth)
  if (fit.length) return [...fit]
  return [Math.round(naturalWidth)]
}

export function parseDisplayManifest(value: unknown): DisplayManifest | null {
  if (!value || typeof value !== 'object') return null
  const row = value as DisplayManifest
  if (row.v !== DISPLAY_VERSION) return null
  return row
}

export function eventPictureFrom(row: {
  imageWidth?: number | null
  imageHeight?: number | null
  imageColor?: string | null
  imageBlur?: string | null
  imageDisplay?: unknown
} | null | undefined): EventPicture | null {
  const manifest = parseDisplayManifest(row?.imageDisplay)
  const widths = (manifest?.widths ?? []).filter((w) => Number.isFinite(w) && w > 0)
  if (!manifest || manifest.pending || !manifest.base || !widths.length) return null
  const width = row?.imageWidth ?? null
  const height = row?.imageHeight ?? null
  return {
    width,
    height,
    color: row?.imageColor ?? null,
    blur: row?.imageBlur ?? null,
    base: manifest.base.replace(/\/$/, ''),
    widths,
    lowQuality: storedPhotoIsLowQuality(width, height),
  }
}

/** Columns written for a finished derivative. The original imageUrl is not one of them. */
export function displayColumnPatch(input: {
  width: number
  height: number
  color: string
  blur: string
  display: DisplayManifest
}) {
  return {
    imageWidth: input.width,
    imageHeight: input.height,
    imageColor: input.color,
    imageBlur: input.blur,
    imageDisplay: input.display,
  }
}

export function displayFileUrl(base: string, width: number, format: 'avif' | 'webp'): string {
  return `${base.replace(/\/$/, '')}/w${width}.${format}`
}

/** Largest stored file. next/image resizes down from this; it is never wider than the source. */
export function displayMasterUrl(picture: EventPicture, format: 'avif' | 'webp' = 'webp'): string {
  const width = picture.widths[picture.widths.length - 1]
  return displayFileUrl(picture.base, width, format)
}

/**
 * Rough storage for a dry-run. Three widths, AVIF plus WebP, about 24KB a file
 * once posters that are already small drop the wider steps.
 */
export function estimateDisplayStorage(uniqueImages: number): { files: number; bytes: number } {
  const count = Math.max(0, Math.floor(uniqueImages))
  const files = count * DISPLAY_WIDTHS.length * 2
  return { files, bytes: files * 24 * 1024 }
}
