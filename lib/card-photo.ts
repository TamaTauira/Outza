/** A listing photo for a square card. Genre holding art is chosen by the image component when this is empty. */
export function cardPhoto(url?: string | null): string | null {
  if (!url || !/^https?:\/\//i.test(url) || /picsum\.photos/i.test(url)) return null
  return url
}
