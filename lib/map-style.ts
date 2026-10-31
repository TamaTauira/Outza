/** Single source of truth for the VibePeep map look (Map page + every detail-page map). */

import type { StyleSpecification } from 'maplibre-gl'
import lightStyle from '@/lib/maps/vibe-light.json'
import darkStyle from '@/lib/maps/vibe-dark.json'

/** Keyless OpenFreeMap vector tiles (OpenMapTiles schema). Commercial use is allowed. Attribution is required. */
export const MAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles © OpenStreetMap contributors'
export const MAP_MAX_ZOOM = 18

export function vibeMapStyle(dark: boolean): StyleSpecification {
  const style = (dark ? darkStyle : lightStyle) as StyleSpecification
  return JSON.parse(JSON.stringify(style)) as StyleSpecification
}

/** Orange teardrop. The tip is the place, so the icon anchors at the bottom. */
export function eventPinHtml(color = '#FF7A1A', letter = ''): string {
  const ink = '#1c1916'
  const mark = letter
    ? `<text x="18" y="20.5" text-anchor="middle" font-family="inherit" font-size="12" font-weight="700" fill="${ink}">${letter}</text>`
    : `<circle cx="18" cy="16" r="4.5" fill="${ink}"/>`
  return `<svg class="se-pin" width="36" height="46" viewBox="0 0 36 46" aria-hidden="true">
    <path d="M18 44.2C18 44.2 4 28.2 4 16.2a14 14 0 1 1 28 0C32 28.2 18 44.2 18 44.2z" fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="18" cy="16" r="8.2" fill="#fff"/>
    ${mark}
  </svg>`
}

export const EVENT_PIN_SIZE: [number, number] = [36, 46]
export const EVENT_PIN_ANCHOR: [number, number] = [18, 44]
