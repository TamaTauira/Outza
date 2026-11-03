// Which published tourism region and which footfall series a listing actually sits in.
// Regional names are matched before the catalogue city, so a Launceston address filed under Hobart stays Launceston.
import { brisbaneFootfallGap, footfallCaveat, footfallLicence, footfallSeriesLabel, melbourneFootfallGap, sydneyFootfallGap } from './curated-refs'

export type StateCode = 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT'
export type FootfallKey = 'melbourne' | 'sydney' | 'brisbane'

export type Market = {
  id: string
  /** Catalogue city this market hangs off, when it is one of the site's city filters. */
  catalogueCity: string | null
  state: StateCode
  /** Official TRA domestic region name (NVS / DoTS). */
  domesticRegion: string
  /** Official TRA international region name, when the IVS workbook publishes one. */
  intlRegion: string | null
  /** Capitals can use the state's quarterly total as a labelled season. Regional cities cannot. */
  useStateTiming: boolean
  footfall: FootfallKey | null
  match: RegExp
  note?: string
}

export const STATE_NAME: Record<StateCode, string> = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', SA: 'South Australia',
  WA: 'Western Australia', TAS: 'Tasmania', NT: 'Northern Territory', ACT: 'Australian Capital Territory',
}

const m = (row: Market) => row

/** Specific places first. resolveMarket() keeps the first hit that is not just the catalogue city. */
export const MARKETS: Market[] = [
  m({ id: 'Albury', catalogueCity: null, state: 'NSW', domesticRegion: 'The Murray', intlRegion: null, useStateTiming: false, footfall: null, match: /\balbury\b/i, note: 'Albury is in TRA’s NSW region The Murray. Wodonga, across the river, is Victoria’s Murray East and is not this number.' }),
  m({ id: 'Wodonga', catalogueCity: null, state: 'VIC', domesticRegion: 'Murray East', intlRegion: null, useStateTiming: false, footfall: null, match: /\bwodonga\b/i, note: 'Wodonga is in TRA’s Victorian region Murray East. Albury, on the NSW bank, is The Murray.' }),
  m({ id: 'Wollongong', catalogueCity: null, state: 'NSW', domesticRegion: 'South Coast', intlRegion: 'South Coast', useStateTiming: false, footfall: null, match: /\bwollongong\b|\billawarra\b/i, note: 'TRA’s South Coast region runs from Wollongong down the coast. It is not a Wollongong-only count.' }),
  m({ id: 'Newcastle', catalogueCity: 'Newcastle', state: 'NSW', domesticRegion: 'Hunter', intlRegion: 'Hunter', useStateTiming: false, footfall: null, match: /\bnewcastle\b|\bhunter valley\b/i, note: 'TRA’s Hunter region includes Newcastle, Lake Macquarie and the valley, not the CBD alone.' }),
  m({ id: 'Sunshine Coast', catalogueCity: null, state: 'QLD', domesticRegion: 'Sunshine Coast', intlRegion: 'Sunshine Coast', useStateTiming: false, footfall: null, match: /\bsunshine coast\b|\bmaroochydore\b|\bcaloundra\b|\bnoosa\b/i }),
  m({ id: 'Gold Coast', catalogueCity: 'Gold Coast', state: 'QLD', domesticRegion: 'Gold Coast', intlRegion: 'Gold Coast', useStateTiming: false, footfall: null, match: /\bgold coast\b|\bsurfers paradise\b|\bbroadbeach\b/i }),
  m({ id: 'Toowoomba', catalogueCity: null, state: 'QLD', domesticRegion: 'Southern Queensland Country', intlRegion: null, useStateTiming: false, footfall: null, match: /\btoowoomba\b/i, note: 'Toowoomba sits in TRA’s Southern Queensland Country region, which is wider than the city.' }),
  m({ id: 'Cairns', catalogueCity: null, state: 'QLD', domesticRegion: 'Tropical North Queensland', intlRegion: 'Tropical North Queensland', useStateTiming: false, footfall: null, match: /\bcairns\b|\bport douglas\b/i, note: 'Cairns is inside TRA’s Tropical North Queensland region, with Port Douglas and the reef coast, not a Cairns-CBD cut.' }),
  m({ id: 'Townsville', catalogueCity: null, state: 'QLD', domesticRegion: 'Townsville', intlRegion: 'Townsville', useStateTiming: false, footfall: null, match: /\btownsville\b/i }),
  m({ id: 'Geelong', catalogueCity: null, state: 'VIC', domesticRegion: 'Geelong and the Bellarine', intlRegion: null, useStateTiming: false, footfall: null, match: /\bgeelong\b|\bbellarine\b/i, note: 'The published region is Geelong and the Bellarine, not Geelong alone and not Melbourne.' }),
  m({ id: 'Ballarat', catalogueCity: null, state: 'VIC', domesticRegion: 'Ballarat', intlRegion: null, useStateTiming: false, footfall: null, match: /\bballarat\b/i }),
  m({ id: 'Bendigo', catalogueCity: null, state: 'VIC', domesticRegion: 'Bendigo Loddon', intlRegion: null, useStateTiming: false, footfall: null, match: /\bbendigo\b/i, note: 'Bendigo is in TRA’s Bendigo Loddon region, which is wider than the city.' }),
  m({ id: 'Launceston', catalogueCity: null, state: 'TAS', domesticRegion: 'Launceston and the North', intlRegion: null, useStateTiming: false, footfall: null, match: /\blaunceston\b/i, note: 'The published region is Launceston and the North, not Launceston alone and not Hobart.' }),
  m({ id: 'Sydney', catalogueCity: 'Sydney', state: 'NSW', domesticRegion: 'Sydney', intlRegion: 'Sydney', useStateTiming: true, footfall: 'sydney', match: /\bsydney\b/i }),
  m({ id: 'Melbourne', catalogueCity: 'Melbourne', state: 'VIC', domesticRegion: 'Melbourne', intlRegion: 'Melbourne', useStateTiming: true, footfall: 'melbourne', match: /\bmelbourne\b/i }),
  m({ id: 'Brisbane', catalogueCity: 'Brisbane', state: 'QLD', domesticRegion: 'Brisbane', intlRegion: 'Brisbane', useStateTiming: true, footfall: 'brisbane', match: /\bbrisbane\b/i }),
  m({ id: 'Perth', catalogueCity: 'Perth', state: 'WA', domesticRegion: 'Destination Perth', intlRegion: 'Destination Perth', useStateTiming: true, footfall: null, match: /\bperth\b|\bfremantle\b/i, note: 'TRA publishes this capital as Destination Perth, which includes Fremantle.' }),
  m({ id: 'Adelaide', catalogueCity: 'Adelaide', state: 'SA', domesticRegion: 'Adelaide', intlRegion: 'Adelaide', useStateTiming: true, footfall: null, match: /\badelaide\b/i }),
  m({ id: 'Canberra', catalogueCity: 'Canberra', state: 'ACT', domesticRegion: 'ACT', intlRegion: 'Canberra', useStateTiming: true, footfall: null, match: /\bcanberra\b/i, note: 'Domestic overnight trips are published for the ACT. International trips are published for Canberra.' }),
  m({ id: 'Hobart', catalogueCity: 'Hobart', state: 'TAS', domesticRegion: 'Hobart and the South', intlRegion: 'Hobart and the South', useStateTiming: true, footfall: null, match: /\bhobart\b/i, note: 'The published region is Hobart and the South, not the waterfront alone.' }),
  m({ id: 'Darwin', catalogueCity: 'Darwin', state: 'NT', domesticRegion: 'Darwin', intlRegion: 'Darwin', useStateTiming: true, footfall: null, match: /\bdarwin\b/i }),
]

export function resolveMarket(input: { city?: string | null; suburb?: string | null; address?: string | null; lgaName?: string | null; sa2Name?: string | null }): Market {
  const blob = [input.suburb, input.address, input.lgaName, input.sa2Name, input.city].filter(Boolean).join(' ')
  const hits = MARKETS.filter((market) => market.match.test(blob))
  const specific = hits.filter((market) => market.id !== input.city)
  if (specific.length) return specific[0]
  const cityHit = hits.find((market) => market.id === input.city) ?? MARKETS.find((market) => market.id === input.city)
  return cityHit ?? MARKETS.find((market) => market.id === 'Sydney')!
}

export function footfallSeriesReady(marketId: string) {
  return MARKETS.some((market) => market.id === marketId && market.footfall != null)
}

export function footfallMissingDetail(marketId: string, asOf = new Date()): string {
  if (marketId === 'Sydney') return sydneyFootfallGap(asOf)
  if (marketId === 'Melbourne') return melbourneFootfallGap(asOf)
  if (marketId === 'Brisbane') return brisbaneFootfallGap(asOf)
  if (['Gold Coast', 'Sunshine Coast', 'Townsville', 'Cairns', 'Toowoomba'].includes(marketId)) {
    return `${marketId} has no day-of-week pedestrian series in the Queensland open-data catalogue. Brisbane’s mall sensors are a different city and are not used as a stand-in. Bikeway counters and state-road vehicle volumes are not a crowd at the venue, so no Friday-versus-Sunday index is invented.`
  }
  return `No free day-of-week pedestrian count is published for ${marketId}. State open-data catalogues were checked for a sensor or hourly series; what is there is crossings, bike cordons or monthly patronage, not a Friday-versus-Sunday crowd. Nothing is borrowed from another city, and nothing is estimated.`
}

export type LoadedFootfall = { seriesLabel: string; caveat: string; url: string; licence: string }

const FOOTFALL_URL: Record<FootfallKey, string> = {
  melbourne: 'https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-monthly-counts-per-hour/information/',
  sydney: 'https://data.nsw.gov.au/data/dataset/5-cityofsydney--pedestrian-counts-from-automated-sensors-sites',
  brisbane: 'https://data.brisbane.qld.gov.au/explore/dataset/pedestrian-movement-counts/',
}

/** Loaded-series label, caveat and licence. Named streets and licences are omitted once their check is stale. */
export function footfallLoaded(key: FootfallKey, asOf = new Date()): LoadedFootfall {
  return {
    seriesLabel: footfallSeriesLabel(key, asOf),
    caveat: footfallCaveat(key, asOf),
    url: FOOTFALL_URL[key],
    licence: footfallLicence(key, asOf),
  }
}
