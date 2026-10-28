/** Leaflet + markercluster from the installed packages (no unpkg). Client only. */
export async function loadLeaflet(): Promise<any> {
  const mod = await import('leaflet')
  const L = (mod as { default?: any }).default ?? mod
  await import('leaflet.markercluster')
  return L
}
