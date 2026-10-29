// VibePeep Intelligence: client-safe registry of the six approved sources and the measures we use.
// Plain-English meaning and limitation text lives here so every card shows the same caveats.

export type SourceKey = 'abs_region' | 'abs_seifa' | 'abs_hsi' | 'tfnsw' | 'dnsw' | 'tra' | 'footfall' | 'google_bp'
export type DataKind = 'observed' | 'derived' | 'modelled' | 'hypothesis'

export type SourceDef = {
  key: SourceKey; name: string; publisher: string; url: string; licence: string; attribution: string
  scheduleHours: number; scheduleLabel: string; scope: string; limitations: string
}

export const INTEL_SOURCES: Record<SourceKey, SourceDef> = {
  abs_region: {
    key: 'abs_region', name: 'ABS Data by Region', publisher: 'Australian Bureau of Statistics',
    url: 'https://www.abs.gov.au/methodologies/data-region-methodology', licence: 'CC BY 4.0',
    attribution: 'Source: Australian Bureau of Statistics, Data by Region (ABS Data API, ABS_REGIONAL_ASGS2021 / ABS_REGIONAL_LGA2021).',
    scheduleHours: 24 * 7, scheduleLabel: 'Checked weekly (ABS updates annually)',
    scope: 'SA2, SA3, SA4, greater capital cities and rest-of-state regions, states and Australia, plus LGAs, for every state and territory',
    limitations: 'Annual official statistics with a lag of one to two years. Census-based measures (household income, education, unemployment, rent, birthplace) are 2016/2021 Census values. Figures describe people who live in an area, not people who attend events there.',
  },
  abs_seifa: {
    key: 'abs_seifa', name: 'ABS SEIFA 2021', publisher: 'Australian Bureau of Statistics',
    url: 'https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia/2021',
    licence: 'CC BY 4.0', attribution: 'Source: Australian Bureau of Statistics, Socio-Economic Indexes for Areas (SEIFA) 2021.',
    scheduleHours: 24 * 30, scheduleLabel: 'Checked monthly (SEIFA is released once per Census)',
    scope: 'SA2, suburbs and localities (SAL), postal areas (POA) and LGAs in every state and territory',
    limitations: 'SEIFA ranks areas, not people. It summarises the area as a whole in 2021 and says nothing about any individual, a household’s spending or anyone’s willingness to pay. Preference order: suburb (SAL), then SA2. If the suburb has no SEIFA deciles, the SA2 indexes are used.',
  },
  abs_hsi: {
    key: 'abs_hsi', name: 'ABS Monthly Household Spending Indicator', publisher: 'Australian Bureau of Statistics',
    url: 'https://www.abs.gov.au/statistics/economy/finance/monthly-household-spending-indicator', licence: 'CC BY 4.0',
    attribution: 'Source: Australian Bureau of Statistics, Monthly Household Spending Indicator (HSI_M).',
    scheduleHours: 24, scheduleLabel: 'Checked daily (ABS releases monthly)',
    scope: 'Each state and territory, plus Australia',
    limitations: 'State and national totals in current prices (not adjusted for inflation). It is not suburb-level or venue-level card spend, and it does not measure ticket sales.',
  },
  tfnsw: {
    key: 'tfnsw', name: 'Transport for NSW Open Data', publisher: 'Transport for NSW',
    url: 'https://opendata.transport.nsw.gov.au/', licence: 'CC BY 4.0',
    attribution: 'Source: Transport for NSW Open Data (Train station entries and exits; Location and facilities).',
    scheduleHours: 24, scheduleLabel: 'Checked daily (monthly datasets)',
    scope: 'NSW train, metro and light rail stations, ferry wharves and coach stops with published facilities',
    limitations: 'Station entries and exits are monthly totals of Opal taps. They are not event attendance and riders are not customers. Distances are straight-line from the venue, not travel times. Bus stops need a TfNSW API key (GTFS) and are not included yet.',
  },
  tra: {
    key: 'tra', name: 'Tourism Research Australia visitor surveys', publisher: 'Australian Trade and Investment Commission (Tourism Research Australia)',
    url: 'https://www.tra.gov.au/en/tourism-statistics/domestic-tourism-statistics-results', licence: 'CC BY 4.0',
    attribution: 'Source: Tourism Research Australia, National Visitor Survey, Domestic Tourism Statistics and International Visitor Survey. © Commonwealth of Australia, licensed under CC BY 4.0.',
    scheduleHours: 24 * 7, scheduleLabel: 'Checked weekly (TRA releases quarterly)',
    scope: 'Tourism regions in every state and territory, plus quarterly state totals',
    limitations: 'Domestic overnight trips by tourism region are year-ending December figures from the final National Visitor Survey (to December 2024). From 2025 the free quarterly workbook publishes state and territory totals, not a quarter for each region. International figures are year-ending June trips for regions in the published International Visitor Survey workbook. Survey estimates for a region, not a venue. A 2024 region total and a 2026 state quarter are different series.',
  },
  footfall: {
    key: 'footfall', name: 'Weekend pedestrian counts', publisher: 'City of Melbourne, City of Sydney and Brisbane City Council',
    url: 'https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-monthly-counts-per-hour/information/',
    licence: 'City of Sydney and Brisbane City Council: CC BY 4.0. City of Melbourne: open data (Victorian catalogue id other-open; the dataset record does not name a Creative Commons deed).',
    attribution: 'Source: City of Melbourne Pedestrian Counting System. City of Sydney Automatic Hourly Pedestrian Count (CC BY 4.0). Brisbane City Council pedestrian movement counts (CC BY 4.0).',
    scheduleHours: 24 * 7, scheduleLabel: 'Checked weekly',
    scope: 'Melbourne CBD sensors (ongoing). Sydney CBD sensors on Elizabeth, Market, Park and Bridge streets (trial ended June 2025). Brisbane mall sensors at Queen Street, Brunswick Street and Chinatown.',
    limitations: 'Counts are movements past a sensor, not attendance and not ticket sales. Melbourne is a mean across CBD sensors, or the nearest sensor within 1 km. Sydney is July 2024–June 2025, not a live feed. Brisbane hours under 25 movements are not published, and the sensor cannot tell a person from a trolley. No free day-of-week pedestrian series is published for the other cities and regions; those reports say so instead of borrowing another city.',
  },
  dnsw: {
    key: 'dnsw', name: 'Destination NSW insights', publisher: 'Destination NSW',
    url: 'https://www.destinationnsw.com.au/insights', licence: 'Destination NSW published statistics (attribution required)',
    attribution: 'Source: Destination NSW, based on Tourism Research Australia National/International Visitor Survey and Domestic Tourism Statistics.',
    scheduleHours: 24 * 7, scheduleLabel: 'Checked weekly (quarterly releases)',
    scope: 'Sydney tourism region and NSW as a whole',
    limitations: 'Survey-based estimates for all of Sydney or all of NSW. They cannot be attributed to a venue or suburb. Domestic figures moved to Domestic Tourism Statistics (DoTS) in 2025, so domestic year-on-year comparisons with older data are not valid.',
  },
  google_bp: {
    key: 'google_bp', name: 'Google Business Profile Performance API', publisher: 'Google',
    url: 'https://developers.google.com/my-business/content/performance', licence: 'Your own Business Profile data (Google API Terms)',
    attribution: 'Source: Google Business Profile Performance API, for the profile you connected.',
    scheduleHours: 24, scheduleLabel: 'Synced daily for connected profiles',
    scope: 'Only the Business Profile location the promoter connects',
    limitations: 'Impressions are times your profile was shown, not unique people. Direction requests are not visits and website clicks are not ticket sales. Google suppresses low search-keyword volumes.',
  },
}
export const SOURCE_KEYS = Object.keys(INTEL_SOURCES) as SourceKey[]

export type MeasureDef = { label: string; unit: string; decimals?: number; meaning: string; limitation?: string; census?: boolean }

const AGE_BANDS = ['0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70-74', '75-79', '80-84', '85+']
export const AGE_MEASURES = AGE_BANDS.map((b, i) => ({ code: `ERP_P_${21 + i}`, band: b }))

export const REGION_MEASURES: Record<string, MeasureDef> = {
  ERP_P_20: { label: 'Estimated resident population', unit: 'people', meaning: 'ABS official estimate of people who usually live in the area at 30 June.' },
  ERP_21: { label: 'Population density', unit: 'people per km²', decimals: 1, meaning: 'Residents per square kilometre of land.' },
  ERP_23: { label: 'Median age of residents', unit: 'years', decimals: 1, meaning: 'Half of residents are younger and half older than this age.' },
  ERP_17: { label: 'Working-age residents (15–64)', unit: '%', decimals: 1, meaning: 'Share of residents aged 15 to 64.' },
  EQUIV_2: { label: 'Median equivalised household income', unit: '$ per week', meaning: 'Weekly household income adjusted for household size, from the Census.', census: true, limitation: 'Census value; not current income and not spending.' },
  INCOME_2: { label: 'Median employee income', unit: '$ per year', meaning: 'Median annual wage and salary income of residents who are employees (ATO-based ABS estimate).', limitation: 'Covers employees only; excludes business and investment income.' },
  LF_4: { label: 'Unemployment rate (Census)', unit: '%', decimals: 1, meaning: 'Share of residents in the labour force who were unemployed on Census night.', census: true },
  LF_5: { label: 'Labour force participation (Census)', unit: '%', decimals: 1, meaning: 'Share of residents aged 15+ working or looking for work on Census night.', census: true },
  CABEE_5: { label: 'Registered businesses', unit: 'businesses', meaning: 'Actively trading businesses with an ABN registered in the area at 30 June.', limitation: 'Counts business registrations by location of registration, not foot traffic or venues.' },
  CABEE_17: { label: 'Accommodation and food businesses', unit: 'businesses', meaning: 'Registered businesses in accommodation, cafés, restaurants, pubs and takeaway.' },
  CABEE_20: { label: 'Arts and recreation businesses', unit: 'businesses', meaning: 'Registered businesses in arts, performing arts, sport and recreation.' },
  SCHOOL_3: { label: 'Residents with a postgraduate degree', unit: '%', decimals: 1, meaning: 'Share of residents aged 15+ whose highest qualification is postgraduate (Census).', census: true },
  SCHOOL_5: { label: 'Residents with a bachelor degree', unit: '%', decimals: 1, meaning: 'Share of residents aged 15+ whose highest qualification is a bachelor degree (Census).', census: true },
  HHTYPE_6: { label: 'Average household size', unit: 'people', decimals: 2, meaning: 'Average number of people per occupied private dwelling (Census).', census: true },
  RENT_4: { label: 'Median weekly rent', unit: '$ per week', meaning: 'Median weekly rent paid by renting households (Census).', census: true },
  CENSUS_13: { label: 'Residents born overseas', unit: '%', decimals: 1, meaning: 'Share of residents born outside Australia (Census).', census: true },
}
for (const a of AGE_MEASURES) REGION_MEASURES[a.code] = { label: `Residents aged ${a.band}`, unit: '%', decimals: 1, meaning: `Share of residents aged ${a.band} years (ABS estimated resident population).` }

export const SEIFA_INDEXES: Record<string, { label: string; meaning: string }> = {
  IRSAD: { label: 'Relative socio-economic advantage and disadvantage', meaning: 'Higher deciles mean the area overall has relatively more advantage and less disadvantage.' },
  IRSD: { label: 'Relative socio-economic disadvantage', meaning: 'Lower deciles mean the area overall has relatively more disadvantage.' },
  IER: { label: 'Economic resources', meaning: 'Area-level household income, housing and assets indicators.' },
  IEO: { label: 'Education and occupation', meaning: 'Area-level qualifications and skilled occupations.' },
}
export const SEIFA_MEASURES: Record<string, string> = { SCORE: 'Score', RWAD: 'Australian decile', RWSD: 'State decile', RWAP: 'Australian percentile', RWSP: 'State percentile' }

export const HSI_CATEGORIES: Record<string, string> = {
  TOT: 'Total household spending', '1': 'Goods', '2': 'Services', '3': 'Discretionary', '4': 'Non-discretionary', '10': 'Food',
  '15': 'Alcoholic beverages and tobacco', '20': 'Clothing and footwear', '30': 'Furnishings and household equipment', '35': 'Health',
  '40': 'Transport', '45': 'Communications', '50': 'Recreation and culture', '60': 'Hotels, cafes and restaurants', '65': 'Miscellaneous goods and services',
}
export const HSI_MEASURES: Record<string, string> = { '7': 'Household spending ($m)', '8': 'Change from previous month (%)', '9': 'Change from same month last year (%)' }

export const GEO_LABELS: Record<string, string> = {
  SA2: 'Venue area (ABS SA2)', SA3: 'District (ABS SA3)', SA4: 'Region (ABS SA4)', GCCSA: 'Greater capital city', STE: 'State', AUS: 'Australia',
  LGA: 'Council area (LGA)', POA: 'Postcode area (POA)', SAL: 'Suburb (ABS SAL)', STATION: 'Station', TOURISM: 'Tourism region',
}
export const GSYD = '1GSYD'
export const NSW = '1'

export const GBP_METRICS: Record<string, string> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'Profile views: desktop Maps', BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'Profile views: desktop Search',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'Profile views: mobile Maps', BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'Profile views: mobile Search',
  WEBSITE_CLICKS: 'Website clicks', CALL_CLICKS: 'Call clicks', BUSINESS_DIRECTION_REQUESTS: 'Direction requests',
}

export const CONFIDENCE_LABEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low', insufficient: 'Insufficient data' }

/** Official imports, plus counts taken live from VibePeep listings (nothing to import). */
export type InsightSource = SourceKey | 'outza_catalogue'

export const INSIGHT_SOURCE_LABEL: Record<InsightSource, string> = {
  abs_region: INTEL_SOURCES.abs_region.name,
  abs_seifa: INTEL_SOURCES.abs_seifa.name,
  abs_hsi: INTEL_SOURCES.abs_hsi.name,
  tfnsw: INTEL_SOURCES.tfnsw.name,
  tra: INTEL_SOURCES.tra.name,
  footfall: INTEL_SOURCES.footfall.name,
  dnsw: INTEL_SOURCES.dnsw.name,
  google_bp: INTEL_SOURCES.google_bp.name,
  outza_catalogue: 'VibePeep event listings',
}
