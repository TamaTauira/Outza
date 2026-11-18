/** Third-party data credits. The intelligence charts and /attributions both use these lines. */

export const ABS_HOME = 'https://www.abs.gov.au/'
export const CC_BY_4 = 'https://creativecommons.org/licenses/by/4.0/'

export const ABS_SEIFA_CREDIT = 'Source: Australian Bureau of Statistics, SEIFA 2021, CC BY 4.0'
export const ABS_REGION_CREDIT = 'Source: Australian Bureau of Statistics, Data by Region, CC BY 4.0'
export const ABS_CENSUS_CREDIT = 'Source: Australian Bureau of Statistics, Data by Region (2021 Census characteristics), CC BY 4.0'
export const ABS_HSI_CREDIT = 'Source: Australian Bureau of Statistics, Monthly Household Spending Indicator, CC BY 4.0'

export type AttributionRow = {
  name: string
  usedFor: string
  credit: string
  url: string
  licence: string
  licenceUrl?: string
}

export const ATTRIBUTIONS: AttributionRow[] = [
  {
    name: 'OpenFreeMap',
    usedFor: 'Map tiles on /map, event pages, the event pop-up, itineraries and local neighbourhood maps',
    credit: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
    url: 'https://openfreemap.org',
    licence: 'OpenMapTiles schema, OpenStreetMap data. Attribution required.',
    licenceUrl: 'https://www.openstreetmap.org/copyright',
  },
  {
    name: 'OpenStreetMap Nominatim',
    usedFor: 'Looking up an address when a listing has no coordinates',
    credit: '© OpenStreetMap contributors',
    url: 'https://nominatim.openstreetmap.org/',
    licence: 'ODbL. The result is a point on our map, not a copy of the OSM database.',
    licenceUrl: 'https://www.openstreetmap.org/copyright',
  },
  {
    name: 'ABS SEIFA 2021',
    usedFor: 'Area socio-economic ranking on Promoter Intelligence',
    credit: ABS_SEIFA_CREDIT,
    url: 'https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia/2021',
    licence: 'CC BY 4.0',
    licenceUrl: CC_BY_4,
  },
  {
    name: 'ABS Data by Region',
    usedFor: 'Who lives around a venue, including estimated resident population',
    credit: ABS_REGION_CREDIT,
    url: 'https://www.abs.gov.au/methodologies/data-region-methodology',
    licence: 'CC BY 4.0',
    licenceUrl: CC_BY_4,
  },
  {
    name: 'ABS 2021 Census characteristics',
    usedFor: 'Census measures inside Data by Region (income, education, birthplace and similar), labelled with year 2021',
    credit: ABS_CENSUS_CREDIT,
    url: 'https://www.abs.gov.au/census',
    licence: 'CC BY 4.0',
    licenceUrl: CC_BY_4,
  },
  {
    name: 'ABS Monthly Household Spending Indicator',
    usedFor: 'State household spending on Promoter Intelligence',
    credit: ABS_HSI_CREDIT,
    url: 'https://www.abs.gov.au/statistics/economy/finance/monthly-household-spending-indicator',
    licence: 'CC BY 4.0',
    licenceUrl: CC_BY_4,
  },
  {
    name: 'Transport for NSW Open Data',
    usedFor: 'Stations and Opal tap-ons near a New South Wales venue',
    credit: 'Source: Transport for NSW Open Data (Train station entries and exits; Location and facilities).',
    url: 'https://opendata.transport.nsw.gov.au/',
    licence: 'CC BY 4.0',
    licenceUrl: CC_BY_4,
  },
  {
    name: 'Tourism Research Australia',
    usedFor: 'Visitor survey totals for a tourism region',
    credit: 'Source: Tourism Research Australia, National Visitor Survey, Domestic Tourism Statistics and International Visitor Survey. © Commonwealth of Australia, CC BY 4.0.',
    url: 'https://www.tra.gov.au/',
    licence: 'CC BY 4.0',
    licenceUrl: CC_BY_4,
  },
  {
    name: 'Destination NSW',
    usedFor: 'Sydney and NSW visitor headlines',
    credit: 'Source: Destination NSW, based on Tourism Research Australia visitor surveys.',
    url: 'https://www.destinationnsw.com.au/insights',
    licence: 'Destination NSW published statistics. Attribution required.',
  },
  {
    name: 'City pedestrian counts',
    usedFor: 'Friday to Sunday movement indexes where a city publishes them',
    credit: 'Source: City of Melbourne, City of Sydney and Brisbane City Council pedestrian counts.',
    url: 'https://data.melbourne.vic.gov.au/',
    licence: 'Each city’s open-data licence. Counts are sensor movements, not ticket sales.',
  },
]
