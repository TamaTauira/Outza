/**
 * Approved VibePeep mascot art for Local category shortcuts.
 * Licence: owned by VibePeep. Generated, and approved for these tiles.
 * Files: public/local-tiles/<name>.webp (800px) and <name>-480.webp.
 */
export interface LocalTile {
  /** Real community section key. Selecting the shortcut filters this section. */
  key: string
  label: string
  alt: string
  src: string | null
  srcSmall: string | null
  /** Shown in the first row. The rest sit behind See all. */
  primary: boolean
}

const art = (file: string) => ({
  src: `/local-tiles/${file}.webp`,
  srcSmall: `/local-tiles/${file}-480.webp`,
})

export const LOCAL_TILES: LocalTile[] = [
  { key: 'garage-sales', label: 'Garage Sales', primary: true, alt: 'VibePeep’s mascot jogging over with a box of garage-sale finds.', ...art('garage-sale') },
  { key: 'farmers-markets', label: 'Markets', primary: true, alt: 'VibePeep’s mascot waving with a basket of market vegetables.', ...art('farmers-market') },
  { key: 'school-fundraisers', label: 'School fetes', primary: true, alt: 'VibePeep’s mascot bringing a tray of bake-sale cupcakes.', ...art('school-fundraiser') },
  { key: 'charity-events', label: 'Charity events', primary: true, alt: 'VibePeep’s mascot bringing a tray of bake-sale cupcakes for a fundraiser.', ...art('school-fundraiser') },
  { key: 'neighbourhood-popups', label: 'Pop-ups', primary: true, alt: 'VibePeep’s mascot popping in with a party cracker and a little flag.', ...art('pop-up') },
  { key: 'community-sport', label: 'Community sport', primary: true, alt: 'VibePeep’s mascot ready for a local game, footy in one hand and a whistle in the other.', ...art('community-sport') },
  { key: 'warehouse-sales', label: 'Clearance', primary: false, alt: 'VibePeep’s mascot holding up a sale sign.', ...art('clearance') },
  { key: 'dog-friendly', label: 'Dog-friendly', primary: false, alt: 'VibePeep’s mascot on a walk with a small fluffy mate.', ...art('dog-friendly') },
  { key: 'local-art', label: 'Local art', primary: false, alt: 'VibePeep’s mascot mid-splash with a spray can and a paint roller.', ...art('local-art') },
  { key: 'community-events', label: 'Community events', primary: false, alt: 'A neighbourhood gathering. No mascot artwork on this tile.', src: null, srcSmall: null },
]

export const LOCAL_TILE_LICENCE = 'Owned by VibePeep. Generated mascot art, approved for these category tiles.'

export const localTileFor = (section: string | null | undefined) => LOCAL_TILES.find((tile) => tile.key === section) ?? null

/**
 * Homepage corner buttons. Workshops has no Local filter of its own.
 * A workshop that is not a garage sale, market, fete, fundraiser, sport or art
 * listing is filed under neighbourhood pop-ups, so that chip is the closest match.
 */
export const CORNER_LOCAL_CATEGORY: Record<string, string> = {
  'garage-sales': 'garage-sales',
  'neighbourhood-popups': 'neighbourhood-popups',
  'school-fundraisers': 'school-fundraisers',
  'community-sport': 'community-sport',
  'farmers-markets': 'farmers-markets',
  workshops: 'neighbourhood-popups',
}

export function localCategoryPath(cornerKey: string): string {
  const category = CORNER_LOCAL_CATEGORY[cornerKey] ?? cornerKey
  return `/local?category=${encodeURIComponent(category)}`
}

export const primaryTiles = () => LOCAL_TILES.filter((tile) => tile.primary)
export const moreTiles = () => LOCAL_TILES.filter((tile) => !tile.primary)
