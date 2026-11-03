// Curated venues, outlets, organisations and addresses named in VibePeep Intelligence.
// Every fact in a note was checked against sourceUrl on lastVerified. A reference with no
// source, a bad date, or a check older than six months is hidden rather than shown.

export type CuratedKind = 'venue' | 'outlet' | 'organisation' | 'address'

export type CuratedRef = {
  id: string
  kind: CuratedKind
  name: string
  /** Public page the card links to. */
  url: string
  /** Facts we are willing to show. */
  note: string
  /** YYYY-MM-DD when the facts in note were checked. */
  lastVerified: string
  /** Page that supports the facts in the note. */
  sourceUrl: string
}

export type ReferenceProblem = 'stale' | 'unverified'

/** A check older than this many calendar months is not shown. */
export const VERIFIED_WITHIN_MONTHS = 6

const CHECKED = '2026-11-03'

function ref(row: Omit<CuratedRef, 'lastVerified'> & { lastVerified?: string }): CuratedRef {
  return { lastVerified: CHECKED, ...row }
}

function cutoffUtc(asOf: Date, months: number): number {
  let year = asOf.getUTCFullYear()
  let month = asOf.getUTCMonth() - months
  while (month < 0) {
    month += 12
    year -= 1
  }
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Date.UTC(year, month, Math.min(asOf.getUTCDate(), lastDay))
}

function parsedUtc(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [year, month, day] = iso.split('-').map(Number)
  const utc = Date.UTC(year, month - 1, day)
  const back = new Date(utc)
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null
  return utc
}

/** What is wrong with a curated reference on asOf. Empty means it may be shown. */
export function referenceProblems(ref: Pick<CuratedRef, 'lastVerified' | 'sourceUrl'>, asOf = new Date()): ReferenceProblem[] {
  const problems: ReferenceProblem[] = []
  const source = ref.sourceUrl?.trim() ?? ''
  const verified = parsedUtc(ref.lastVerified?.trim() ?? '')
  const today = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
  if (!source || !/^https?:\/\//i.test(source) || verified == null || verified > today) problems.push('unverified')
  if (verified != null && verified < cutoffUtc(asOf, VERIFIED_WITHIN_MONTHS)) problems.push('stale')
  return problems
}

export function isReferenceShowable(ref: Pick<CuratedRef, 'lastVerified' | 'sourceUrl'>, asOf = new Date()): boolean {
  return referenceProblems(ref, asOf).length === 0
}

export function visibleRefs<T extends Pick<CuratedRef, 'lastVerified' | 'sourceUrl'>>(refs: T[], asOf = new Date()): T[] {
  return refs.filter((row) => isReferenceShowable(row, asOf))
}

export const STAR: CuratedRef = ref({
  id: 'star-observer',
  kind: 'outlet',
  name: 'Star Observer',
  url: 'https://www.starobserver.com.au/',
  note: 'LGBTQIA+ masthead. On 26 October 2026 the publisher said it has not closed and is still reporting. Pitch the date. Not a ticket outlet, and not a measured audience.',
  sourceUrl: 'https://www.starobserver.com.au/news/a-statement-from-the-publisher-were-here-to-stay/244754',
})

export const DNA: CuratedRef = ref({
  id: 'dna-magazine',
  kind: 'outlet',
  name: 'DNA Magazine',
  url: 'https://www.dnamagazine.com.au/',
  note: 'National magazine in print and online. The publisher’s media kit describes the print audience as men who are same-sex attracted, including gay and bisexual men and same-sex attracted trans men. A fit when the room actually skews that way.',
  sourceUrl: 'https://www.dnamagazine.com.au/wp-content/uploads/2025/09/DNA-Media-Kit-2025.pdf',
})

export const FROOTY: CuratedRef = ref({
  id: 'frooty',
  kind: 'outlet',
  name: 'FROOTY',
  url: 'https://frooty.com.au/',
  note: 'Queer print title from the publisher of Scenestr, distributed every four weeks. Useful for music, nightlife and arts.',
  sourceUrl: 'https://frooty.com.au/company/about-frooty',
})

export const MARDI: CuratedRef = ref({
  id: 'sydney-mardi-gras',
  kind: 'organisation',
  name: 'Sydney Gay and Lesbian Mardi Gras',
  url: 'https://www.mardigras.org.au/',
  note: 'The 2027 parade is on Saturday 6 March along Oxford Street, Flinders Street and Anzac Parade, in Darlinghurst and Surry Hills. Pitch the festival program as well as the parade.',
  sourceUrl: 'https://www.mardigras.org.au/event/parade/',
})

export const STONEWALL: CuratedRef = ref({
  id: 'stonewall-newtown',
  kind: 'venue',
  name: 'Stonewall Newtown',
  url: 'https://www.stonewallnewtown.com.au/',
  note: 'Open at 157 King Street, Newtown NSW 2042. The Oxford Street chapter in Darlinghurst ended in 2026, when Stonewall moved to Newtown. Ask what they are programming, and use the King Street address.',
  sourceUrl: 'https://www.stonewallnewtown.com.au/about',
})

export const JOY: CuratedRef = ref({
  id: 'joy-949',
  kind: 'outlet',
  name: 'JOY 94.9',
  url: 'https://joy.org.au/',
  note: 'LGBTIQA+ community radio, on 94.9 FM and DAB+. Sponsorship and community announcements, not a national network buy.',
  sourceUrl: 'https://joy.org.au/we-are-joy/',
})

export const MIDSUMMA: CuratedRef = ref({
  id: 'midsumma',
  kind: 'organisation',
  name: 'Midsumma Festival',
  url: 'https://www.midsumma.org.au/',
  note: 'Melbourne’s queer festival. The 2027 season is 17 January to 7 February, and they sell space in the printed festival guide.',
  sourceUrl: 'https://www.midsumma.org.au/participate/advertise-in-midsumma-guide/',
})

export const QNEWS: CuratedRef = ref({
  id: 'qnews',
  kind: 'outlet',
  name: 'QNews',
  url: 'https://qnews.com.au/',
  note: 'LGBTIQA+ publication founded in Brisbane in 2000. The print magazine has closed; it is digital-first now.',
  sourceUrl: 'https://qnews.com.au/about-us/',
})

export const BRISBANE_PRIDE: CuratedRef = ref({
  id: 'brisbane-pride',
  kind: 'organisation',
  name: 'Brisbane Pride Festival',
  url: 'https://www.brisbanepride.org.au/',
  note: 'Runs the Queens Ball, the rally and march, and Fair Day. The 2026 festival runs from 26 September to 7 November, with Fair Day and the march together on 7 November.',
  sourceUrl: 'https://www.brisbanepride.org.au/events/',
})

export const GOLD_COAST_PRIDE: CuratedRef = ref({
  id: 'gold-coast-pride',
  kind: 'organisation',
  name: 'Gold Coast Pride Collective',
  url: 'https://www.gcpridecollective.com/',
  note: 'Runs the Gold Coast Pride Fair Day. The 2026 fair was on 27 June at HOTA, Surfers Paradise. Use their program when the next season is listed.',
  sourceUrl: 'https://www.gcpridecollective.com/pride2026-1/pridefair2026',
})

export const OUTINPERTH: CuratedRef = ref({
  id: 'outinperth',
  kind: 'outlet',
  name: 'OUTinPerth',
  url: 'https://www.outinperth.com/',
  note: 'Western Australia’s LGBTIQA+ publication. Fully digital since 2019. The local masthead to pitch before a national one.',
  sourceUrl: 'https://www.outinperth.com/on-this-gay-day-outinperth-arrived/',
})

export const PRIDE_WA: CuratedRef = ref({
  id: 'pride-wa',
  kind: 'organisation',
  name: 'Pride WA',
  url: 'https://pridewa.com.au/',
  note: 'Perth’s Pride organisation. PrideFEST 2026 runs from 8 November to 3 December, and the parade is on 28 November through Northbridge.',
  sourceUrl: 'https://www.outinperth.com/2026-pridefest-program-launched/',
})

export const FEAST: CuratedRef = ref({
  id: 'feast-festival',
  kind: 'organisation',
  name: 'Feast Festival',
  url: 'https://feast.org.au/',
  note: 'Adelaide’s LGBTQIA+ arts festival. The 2026 season is 1–22 November. List the show in the program, or advertise beside it.',
  sourceUrl: 'https://feast.org.au/events/opening-night-street-party/',
})

export const FUSE: CuratedRef = ref({
  id: 'fuse-magazine',
  kind: 'outlet',
  name: 'FUSE Magazine',
  url: 'https://fusemagazine.com.au/',
  note: 'LGBTIQ+ magazine. The latest issue is online and in print, and FUSE is SpringOUT’s media partner for the festival running 23 October to 1 December 2026.',
  sourceUrl: 'https://fusemagazine.com.au/fuse-message-board/lgbtiq-community/1468-springout-festival-guide-2026.html',
})

export const SPRINGOUT: CuratedRef = ref({
  id: 'springout',
  kind: 'organisation',
  name: 'SpringOUT',
  url: 'https://springout.com.au/',
  note: 'Canberra’s Pride festival, running 23 October to 1 December 2026. The program is the local listing.',
  sourceUrl: 'https://springout.com.au/',
})

export const TASPRIDE: CuratedRef = ref({
  id: 'taspride',
  kind: 'organisation',
  name: 'TasPride',
  url: 'https://www.taspride.com/',
  note: 'Tasmania’s Pride festival. The 2027 season runs from 29 January to 28 February, with the Hobart parade on 13 February.',
  sourceUrl: 'https://www.taspride.com/taspride-festival-2027',
})

export const TOP_END: CuratedRef = ref({
  id: 'top-end-pride',
  kind: 'organisation',
  name: 'Top End Pride',
  url: 'https://topendpride.com.au/',
  note: 'Runs Darwin Pride Festival. The 2026 festival was 18–21 June. Use the program once the next window is published.',
  sourceUrl: 'https://topendpride.com.au/pride-2026/',
})

export const NEWCASTLE_PRIDE: CuratedRef = ref({
  id: 'newcastle-pride',
  kind: 'organisation',
  name: 'Newcastle Pride',
  url: 'https://newcastlepride.com.au/',
  note: 'Newcastle’s Pride festival organisation. The 2026 program started on 9 October, with the parade on 24 October. Fair Day was paused for lack of funding until the following year.',
  sourceUrl: 'https://qnews.com.au/newcastle-pride-unveil-a-packed-festival-program-for-october/',
})

const SYDNEY_STREETS: CuratedRef = ref({
  id: 'sydney-sensor-streets',
  kind: 'address',
  name: 'Elizabeth Street, Market Street, Park Street and Bridge Street',
  url: 'https://data.nsw.gov.au/data/dataset/5-cityofsydney--pedestrian-counts-from-automated-sensors-sites',
  note: 'Elizabeth Street, Market Street, Park Street and Bridge Street',
  sourceUrl: 'https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Automatic_Hourly_Pedestrian_Count/FeatureServer/0/query?where=1%3D1&outFields=Location_Name&returnDistinctValues=true&returnGeometry=false&f=json',
})

const SYDNEY_TRIAL: CuratedRef = ref({
  id: 'sydney-sensor-trial',
  kind: 'organisation',
  name: 'City of Sydney pedestrian counter trial',
  url: 'https://data.nsw.gov.au/data/dataset/5-cityofsydney--pedestrian-counts-from-automated-sensors-sites',
  note: 'The City of Sydney automated pedestrian-counter trial collected CBD counts from February 2020 until June 2025. The dataset record does not name a licence. Park Street is one of the counters.',
  sourceUrl: 'https://data.nsw.gov.au/data/dataset/5-cityofsydney--pedestrian-counts-from-automated-sensors-sites',
})

const MELBOURNE_SENSORS: CuratedRef = ref({
  id: 'melbourne-pedestrian-sensors',
  kind: 'organisation',
  name: 'City of Melbourne Pedestrian Counting System',
  url: 'https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-monthly-counts-per-hour/information/',
  note: 'The City of Melbourne Pedestrian Counting System publishes hourly counts from sensors across the city, updated monthly. The information page does not name a Creative Commons deed.',
  sourceUrl: 'https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-monthly-counts-per-hour/information/',
})

const BRISBANE_MALLS: CuratedRef = ref({
  id: 'brisbane-mall-sensors',
  kind: 'address',
  name: 'Queen Street Mall, Brunswick Street Mall and Chinatown Mall',
  url: 'https://data.brisbane.qld.gov.au/explore/dataset/pedestrian-movement-counts/',
  note: 'Brisbane City Council line sensors in Queen Street Mall, Brunswick Street Mall and Chinatown Mall. A count is a movement across the line, not a unique person. Hours under 25 movements are not published as an exact figure. CC BY 4.0.',
  sourceUrl: 'https://researchdata.edu.au/pedestrian-movement-counts/4066494',
})

/** Every curated name Intelligence may show. The freshness test walks this list. */
export const CURATED_REFERENCES: CuratedRef[] = [
  STAR, DNA, FROOTY, MARDI, STONEWALL, JOY, MIDSUMMA, QNEWS, BRISBANE_PRIDE, GOLD_COAST_PRIDE,
  OUTINPERTH, PRIDE_WA, FEAST, FUSE, SPRINGOUT, TASPRIDE, TOP_END, NEWCASTLE_PRIDE,
  SYDNEY_STREETS, SYDNEY_TRIAL, MELBOURNE_SENSORS, BRISBANE_MALLS,
]

const OMITTED = 'That description is hidden until the named place is checked again. Nothing is estimated.'

export function sydneyFootfallGap(asOf = new Date()): string {
  const streets = isReferenceShowable(SYDNEY_STREETS, asOf)
  const trial = isReferenceShowable(SYDNEY_TRIAL, asOf)
  const tail = 'Those counts are not in the database yet, so there is no Friday-versus-Sunday index. Monthly Opal totals are not a day of the week.'
  if (streets && trial) {
    return `City of Sydney published hourly counts for ${SYDNEY_STREETS.note}. The sensor trial ended in June 2025. The current dataset record does not name a licence. ${tail}`
  }
  return `No current verified street list for the City of Sydney pedestrian sensors is being shown. ${tail} ${OMITTED}`
}

export function melbourneFootfallGap(asOf = new Date()): string {
  if (!isReferenceShowable(MELBOURNE_SENSORS, asOf)) {
    return `No current verified description of the City of Melbourne pedestrian sensors is being shown. They are not in the database yet, so there is no Friday-versus-Sunday index. ${OMITTED}`
  }
  return 'The City of Melbourne Pedestrian Counting System publishes hourly counts from sensors across the city, updated monthly. They are not in the database yet, so there is no Friday-versus-Sunday index.'
}

export function brisbaneFootfallGap(asOf = new Date()): string {
  if (!isReferenceShowable(BRISBANE_MALLS, asOf)) {
    return `Brisbane City Council publishes hourly pedestrian movement counts. The mall names are hidden until they are checked again. They are not in the database yet, so there is no Friday-versus-Sunday index. ${OMITTED}`
  }
  return 'Brisbane City Council publishes hourly pedestrian movement counts for Queen Street Mall, Brunswick Street Mall and Chinatown Mall (CC BY 4.0). They are not in the database yet, so there is no Friday-versus-Sunday index.'
}

export function footfallSeriesLabel(key: 'melbourne' | 'sydney' | 'brisbane', asOf = new Date()): string {
  if (key === 'sydney') {
    return isReferenceShowable(SYDNEY_STREETS, asOf)
      ? 'City of Sydney sensors on Elizabeth, Market, Park and Bridge streets'
      : 'City of Sydney pedestrian sensors'
  }
  if (key === 'brisbane') {
    return isReferenceShowable(BRISBANE_MALLS, asOf)
      ? 'Brisbane mall sensors (Queen Street, Brunswick Street, Chinatown)'
      : 'Brisbane mall sensors'
  }
  return 'City of Melbourne pedestrian sensors'
}

export function footfallCaveat(key: 'melbourne' | 'sydney' | 'brisbane', asOf = new Date()): string {
  if (key === 'melbourne') {
    if (!isReferenceShowable(MELBOURNE_SENSORS, asOf)) return OMITTED
    return 'Hourly counts from the City of Melbourne Pedestrian Counting System, sensors across the city, updated monthly. The city figure is the mean across those sensors; a venue within 1 km uses the nearest sensor. People passing a sensor, not a queue at the door. The dataset information page does not name a Creative Commons deed. Attribute the City of Melbourne.'
  }
  if (key === 'sydney') {
    if (!isReferenceShowable(SYDNEY_STREETS, asOf) || !isReferenceShowable(SYDNEY_TRIAL, asOf)) return OMITTED
    return 'Hourly counts from the City of Sydney automatic sensors on Elizabeth Street, Market Street, Park Street and Bridge Street. The trial ended in June 2025, so this is July 2024 to June 2025, not a live feed. The current dataset record does not name a licence. Four CBD streets, not the suburb and not the door.'
  }
  if (!isReferenceShowable(BRISBANE_MALLS, asOf)) return OMITTED
  return 'Brisbane City Council line sensors in Queen Street Mall, Brunswick Street Mall and Chinatown Mall. A count is a movement across the line, not a unique person, and the sensors cannot tell a person from a trolley. Hours under 25 movements are not published, so the average uses only the hours they release. CC BY 4.0. Not the Gold Coast, and not the venue door.'
}

export function footfallLicence(key: 'melbourne' | 'sydney' | 'brisbane', asOf = new Date()): string {
  if (key === 'melbourne') return isReferenceShowable(MELBOURNE_SENSORS, asOf) ? 'Dataset information page does not name a Creative Commons deed' : 'Unverified'
  if (key === 'sydney') return isReferenceShowable(SYDNEY_TRIAL, asOf) ? 'Not named on the current City of Sydney dataset record' : 'Unverified'
  return isReferenceShowable(BRISBANE_MALLS, asOf) ? 'CC BY 4.0' : 'Unverified'
}

export function footfallScope(asOf = new Date()): string {
  const melbourne = isReferenceShowable(MELBOURNE_SENSORS, asOf)
    ? 'Melbourne sensors across the city (ongoing, updated monthly).'
    : 'Melbourne sensor description hidden until it is checked again.'
  const sydney = isReferenceShowable(SYDNEY_STREETS, asOf) && isReferenceShowable(SYDNEY_TRIAL, asOf)
    ? 'Sydney sensors on Elizabeth, Market, Park and Bridge streets (trial ended June 2025).'
    : 'Sydney street names hidden until they are checked again.'
  const brisbane = isReferenceShowable(BRISBANE_MALLS, asOf)
    ? 'Brisbane mall sensors at Queen Street, Brunswick Street and Chinatown.'
    : 'Brisbane mall names hidden until they are checked again.'
  return `${melbourne} ${sydney} ${brisbane}`
}

export function footfallLicenceLine(asOf = new Date()): string {
  return `City of Sydney: ${footfallLicence('sydney', asOf)}. Brisbane City Council: ${footfallLicence('brisbane', asOf)}. City of Melbourne: ${footfallLicence('melbourne', asOf)}.`
}

export function footfallAttribution(asOf = new Date()): string {
  const sydney = isReferenceShowable(SYDNEY_TRIAL, asOf)
    ? 'City of Sydney Automatic Hourly Pedestrian Count (licence not named on the current dataset record).'
    : 'City of Sydney pedestrian counts (licence hidden until it is checked again).'
  const brisbane = isReferenceShowable(BRISBANE_MALLS, asOf)
    ? 'Brisbane City Council pedestrian movement counts (CC BY 4.0).'
    : 'Brisbane City Council pedestrian movement counts (licence hidden until it is checked again).'
  const melbourne = isReferenceShowable(MELBOURNE_SENSORS, asOf)
    ? 'City of Melbourne Pedestrian Counting System.'
    : 'City of Melbourne Pedestrian Counting System (description hidden until it is checked again).'
  return `Source: ${melbourne} ${sydney} ${brisbane}`
}
