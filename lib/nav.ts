/** The seven tabs, in order. Labels, order and icons stay as they are. */
export const NAV_ITEMS = [
  { key: 'board', label: 'Explore', href: '/' },
  { key: 'map', label: 'Map', href: '/map' },
  { key: 'local', label: 'Local', href: '/local' },
  { key: 'ask', label: 'Ask', href: null },
  { key: 'itinerary', label: 'Itinerary', href: '/itinerary' },
  { key: 'saved', label: 'Saved', href: '/saved' },
  { key: 'menu', label: 'Menu', href: null },
] as const

export type NavKey = (typeof NAV_ITEMS)[number]['key']

export function navItem(key: NavKey) {
  const item = NAV_ITEMS.find((entry) => entry.key === key)
  if (!item) throw new Error(`Unknown nav item ${key}`)
  return item
}
