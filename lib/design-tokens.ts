/**
 * VibePeep visual tokens (design spec v1.1, section 10.2).
 * CSS custom properties in app/design-tokens.css must match these values.
 * Logo files, the roaming mascot and email colours stay on the artwork hexes in lib/brand.ts.
 */

export const VP_COLOUR = {
  bgCanvas: '#0C0F0E',
  bgSurface: '#151A19',
  bgElevated: '#1D2422',
  bgRaised: '#252D2A',
  borderSubtle: '#26302C',
  borderDefault: '#303936',
  textPrimary: '#F5F5F2',
  textSecondary: '#B8C0BC',
  textMuted: '#89938E',
  brandOrange: '#FF7A35',
  brandPink: '#F05A9D',
  brandAmber: '#FFC078',
  /** Orange small-text on a light surface. #FF7A35 is below 4.5:1 on white. */
  brandOrangeInk: '#9A3412',
} as const

export const VP_RADIUS = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
} as const

export const VP_SPACE = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const

/** v1.1 replaces the 1280px global cap. */
export const VP_CONTAINER_MAX = '1760px'

/** Gap under the sticky nav. Matches the Map toolbar padding-top. */
export const VP_PAGE_TOP = '0.5rem'

/** One gap between cards, horizontal and vertical. */
export const VP_CARD_GAP = '1rem'

export const VP_TYPE = {
  display: 'Manrope',
  body: 'Inter',
  headingWeight: '700',
  displayWeight: '800',
  bodyWeight: '400',
  bodyStrongWeight: '500',
  buttonWeight: '600',
  minMobilePx: 13,
} as const

export const VP_BREAKPOINT = {
  phone: '600px',
  compactNav: '768px',
} as const
