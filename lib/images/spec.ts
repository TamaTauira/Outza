/** Shared (client-safe) image pipeline constants and payload helpers. */

export type VariantKind = 'card' | 'featured' | 'hero' | 'square'

/** Target output sizes. The largest width is the spec size; smaller widths are responsive variants. */
export const VARIANTS: Record<VariantKind, { w: number; h: number; widths: number[] }> = {
  card: { w: 800, h: 600, widths: [400, 800] },
  featured: { w: 1600, h: 900, widths: [800, 1600] },
  hero: { w: 1920, h: 1080, widths: [960, 1920] },
  square: { w: 800, h: 800, widths: [400, 800] },
}

export const FORMATS = ['avif', 'webp'] as const

/** Stored in ImageAsset.variants */
export interface VariantManifest {
  base: string // public URL folder
  sizes: Partial<Record<VariantKind, number[]>>
  v?: number
}

export interface ClientImage {
  status: string
  width: number | null
  height: number | null
  variants: VariantManifest | null
}

export const imageAssetSelect = { status: true, width: true, height: true, variants: true } as const

export function variantUrl(m: VariantManifest, kind: VariantKind, w: number, fmt: string) {
  return `${m.base}/${kind}-${w}.${fmt}`
}

export function srcSet(m: VariantManifest, kind: VariantKind, fmt: string): string | null {
  const ws = m.sizes[kind]
  if (!ws?.length) return null
  return ws.map((w) => `${variantUrl(m, kind, w, fmt)} ${w}w`).join(', ')
}
