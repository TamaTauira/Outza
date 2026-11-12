/** The peek already sits on the event URL. A same-path client click is a no-op, so reload the document. */
export function fullPageNavigation(currentPathname: string, href: string): 'reload' | 'assign' {
  try {
    const path = new URL(href, 'https://outza.local').pathname
    return path === currentPathname ? 'reload' : 'assign'
  } catch {
    return 'assign'
  }
}
