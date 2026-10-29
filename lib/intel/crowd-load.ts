// Read the active TRA and footfall versions for one listing. No estimates.
import { readObs } from './store'
import { haversineKm } from './util'
import { regionSlug } from './tra-parse'
import { FOOTFALL_LOADED, type Market } from './markets'
import { buildVisitor, buildWeekend, type VisitorSignal, type WeekendSignal } from './crowd-shape'

const SITES: Record<string, string | null> = { melbourne: 'melbourne_sites', brisbane: 'brisbane_sites', sydney: null }
const CITY: Record<string, string> = { melbourne: 'Melbourne', brisbane: 'Brisbane', sydney: 'Sydney' }

export async function loadVisitor(market: Market, month: number): Promise<VisitorSignal | null> {
  const domesticCode = regionSlug(market.domesticRegion)
  const intlCode = market.intlRegion ? regionSlug(market.intlRegion) : ''
  const [domestic, spend, intl, quarters] = await Promise.all([
    readObs('tra', 'region_year', { geoCode: domesticCode }),
    readObs('tra', 'region_spend', { geoCode: domesticCode, measure: 'DOM_SPEND' }),
    intlCode ? readObs('tra', 'intl_region', { geoCode: intlCode }) : Promise.resolve([]),
    readObs('tra', 'state_quarter', { geoCode: market.state, measure: 'DOM_TRIPS' }),
  ])
  return buildVisitor(market, month, domestic, spend, intl, quarters)
}

export async function loadWeekend(market: Market, lat: number | null, lng: number | null): Promise<WeekendSignal | null> {
  const key = market.footfall
  if (!key) return null
  const meta = FOOTFALL_LOADED[key]
  const sitesDataset = SITES[key]
  let rows = await readObs('footfall', key, { geoType: 'CITY', geoCode: CITY[key] })
  let seriesLabel = meta.seriesLabel
  if (sitesDataset && lat != null && lng != null) {
    const sites = await readObs('footfall', sitesDataset, {})
    const by = new Map<string, { id: string; name: string; lat: number | null; lng: number | null }>()
    for (const row of sites) {
      const site = by.get(row.geoCode) ?? { id: row.geoCode, name: row.category, lat: null, lng: null }
      if (row.measure === 'LAT' && row.value != null) site.lat = row.value
      if (row.measure === 'LNG' && row.value != null) site.lng = row.value
      if (row.category) site.name = row.category
      by.set(row.geoCode, site)
    }
    let nearest: { id: string; name: string; km: number } | null = null
    for (const site of by.values()) {
      if (site.lat == null || site.lng == null) continue
      const km = haversineKm({ lat, lng }, { lat: site.lat, lng: site.lng })
      if (km <= 1 && (!nearest || km < nearest.km)) nearest = { id: site.id, name: site.name, km }
    }
    if (nearest) {
      const sensor = await readObs('footfall', key, { geoType: 'SENSOR', geoCode: nearest.id })
      if (sensor.length) {
        rows = sensor
        const dist = nearest.km < 1 ? `${Math.round(nearest.km * 1000)} m` : `${nearest.km.toFixed(1)} km`
        seriesLabel = `${nearest.name} (${dist} from the pin)`
      }
    }
  }
  return buildWeekend(rows, { ...meta, seriesLabel })
}
