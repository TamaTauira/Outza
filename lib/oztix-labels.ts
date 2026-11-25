import { classifyCategory } from '@/lib/categories'

function tidyGenre(value: string): string {
  const label = value.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!label || label.length > 80) return ''
  return label
}

function genreLabel(raw: unknown): string {
  if (typeof raw === 'string') return tidyGenre(raw)
  if (!raw || typeof raw !== 'object') return ''
  const row = raw as Record<string, unknown>
  for (const key of ['Name', 'name', 'CategoryName', 'category']) {
    if (typeof row[key] === 'string') return tidyGenre(row[key] as string)
  }
  return ''
}

/**
 * Oztix event-guide categories, as genre labels for the shared classifier.
 * A band on the listing is a music signal. Nothing here picks a category on its own.
 */
export function oztixGenreLabels(categories: unknown, bands?: unknown): string[] {
  const labels: string[] = []
  const push = (raw: unknown) => {
    const label = genreLabel(raw)
    if (label && !labels.includes(label)) labels.push(label)
  }
  if (Array.isArray(categories)) for (const item of categories) push(item)
  if (Array.isArray(bands) && bands.length > 0) push('Music')
  return labels
}

/** Same classifier every other source uses, with the Oztix category list as genres. */
export function classifyOztixListing(
  title: string,
  description: string | null | undefined,
  categories: unknown,
  bands?: unknown,
) {
  return classifyCategory(title, description ?? '', oztixGenreLabels(categories, bands))
}
