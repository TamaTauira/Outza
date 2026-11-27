import { saveEvent, toSydneyParts } from '@/lib/event-store'
import { noteSourceSaved, yieldIfBudget } from '@/lib/source-budget'
import { CITIES } from '@/lib/cities'

/**
 * Always-popular regular events (markets, food precincts, night markets, seasonal icons).
 * Schedules researched from official organiser sites (Oct 2026). Days: 0=Sun … 6=Sat.
 * `season` is a MM-DD window (may wrap the new year); `once` is a dated run with an end date.
 */
interface Slot { days: number[]; start: string; end: string }
interface Curated {
  title: string
  city: string
  venueName: string
  venueAddress: string
  url: string
  description: string
  slots?: Slot[]
  season?: { from: string; to: string }
  once?: { start: string; end: string; time: string; endTime: string }
  isFree?: boolean
  price?: string
  genres?: string[]
}

const WEEKEND = [0, 6]

export const CURATED: Curated[] = [
  // ── Sydney ─────────────────────────────────────────────
  { title: 'The Rocks Markets', city: 'Sydney', venueName: 'The Rocks Markets', venueAddress: 'George St & Jack Mundey Pl, The Rocks NSW 2000', url: 'https://www.therocks.com/whats-on/market-overview',
    description: 'Sydney’s best-loved weekend market: hundreds of stalls of art, design, jewellery and gourmet street food along George Street in the historic Rocks precinct.', slots: [{ days: WEEKEND, start: '10:00', end: '17:00' }], isFree: true, genres: ['market'] },
  { title: 'The Rocks Friday Foodie Market', city: 'Sydney', venueName: 'The Rocks Markets', venueAddress: 'Jack Mundey Pl, The Rocks NSW 2000', url: 'https://www.therocks.com/whats-on/events/fridays-at-the-rocks-markets',
    description: 'A smaller, food-focused Friday market in The Rocks: street food, artisan producers and quick gifts.', slots: [{ days: [5], start: '10:00', end: '15:00' }], isFree: true, genres: ['market', 'food'] },
  { title: 'The Grounds of Alexandria', city: 'Sydney', venueName: 'The Grounds of Alexandria', venueAddress: '7a/2 Huntley St, Alexandria NSW 2015', url: 'https://thegrounds.com.au/',
    description: 'Sydney’s famous garden café precinct: lush gardens, the Potting Shed, Garden Bar & BBQ and seasonal pop-ups and themed installations. Check the website for current activations.', slots: [{ days: WEEKEND, start: '07:30', end: '16:00' }], isFree: true, genres: ['food'] },
  { title: 'Carriageworks Farmers Market', city: 'Sydney', venueName: 'Carriageworks', venueAddress: '245 Wilson St, Eveleigh NSW 2015', url: 'https://carriageworks.com.au/events/carriageworks-farmers-market/',
    description: 'One of Sydney’s most popular farmers markets, in a heritage railway workshop: seasonal NSW produce, cheese, flowers, coffee and breakfast stalls.', slots: [{ days: [6], start: '08:00', end: '13:00' }], isFree: true, genres: ['market', 'food'] },
  { title: 'Paddington Markets', city: 'Sydney', venueName: 'Paddington Uniting Church', venueAddress: '395 Oxford St, Paddington NSW 2021', url: 'https://www.paddingtonmarkets.com.au/',
    description: 'Iconic open-air artisan market on Oxford Street: local fashion, handmade art and craft, jewellery and food, rain or shine.', slots: [{ days: [6], start: '10:00', end: '16:00' }], isFree: true, genres: ['market'] },
  { title: 'Glebe Markets', city: 'Sydney', venueName: 'Glebe Public School', venueAddress: 'Glebe Point Rd, Glebe NSW 2037', url: 'https://www.glebemarkets.com.au/',
    description: 'Laid-back Saturday market loved for vintage clothing, bargain finds, handmade goods and live music.', slots: [{ days: [6], start: '10:00', end: '16:00' }], isFree: true, genres: ['market'] },
  { title: 'Bondi Markets', city: 'Sydney', venueName: 'Bondi Beach Public School', venueAddress: 'Campbell Pde, Bondi Beach NSW 2026', url: 'https://bondimarkets.com.au/bondi-markets',
    description: 'Sunday beachside market: local designers, vintage fashion, prints and accessories steps from Bondi Beach.', slots: [{ days: [0], start: '10:00', end: '16:00' }], isFree: true, genres: ['market'] },
  { title: 'Bondi Farmers Market', city: 'Sydney', venueName: 'Bondi Beach Public School', venueAddress: 'Cnr Campbell Pde & Warners Ave, Bondi Beach NSW 2026', url: 'https://bondimarkets.com.au/bondi-farmers-markets',
    description: 'Saturday morning farmers market by the beach: produce, seafood, bakers, coffee and street food.', slots: [{ days: [6], start: '09:00', end: '13:00' }], isFree: true, genres: ['market', 'food'] },
  { title: 'Chatswood Mall Markets', city: 'Sydney', venueName: 'Chatswood Mall', venueAddress: 'Victoria Ave, Chatswood NSW 2067', url: 'https://www.willoughby.nsw.gov.au/',
    description: 'Busy multicultural street-food and produce market in the heart of Chatswood, running into the evening.', slots: [{ days: [4, 5, 6], start: '10:00', end: '21:00' }], isFree: true, genres: ['market', 'food'] },
  { title: 'Sculpture by the Sea, Bondi', city: 'Sydney', venueName: 'Bondi to Tamarama Coastal Walk', venueAddress: 'Bondi to Tamarama Coastal Walk, Bondi NSW 2026', url: 'https://sculpturebythesea.com/bondi/',
    description: 'The world’s largest free public sculpture exhibition: 100+ artworks along 2km of clifftop coastal walk, celebrating 30 years.', once: { start: '2026-10-16', end: '2026-11-02', time: '06:00', endTime: '18:00' }, isFree: true, genres: ['exhibition', 'art'] },

  // ── Melbourne ──────────────────────────────────────────
  { title: 'Queen Victoria Market', city: 'Melbourne', venueName: 'Queen Victoria Market', venueAddress: 'Queen St, Melbourne VIC 3000', url: 'https://qvm.com.au/',
    description: 'Melbourne’s landmark open-air market since 1878: fresh produce, delis, hot jam donuts and hundreds of specialty stalls.', slots: [{ days: [2, 4, 5], start: '06:00', end: '15:00' }, { days: [6], start: '06:00', end: '16:00' }, { days: [0], start: '09:00', end: '16:00' }], isFree: true, genres: ['market', 'food'] },
  { title: 'Queen Victoria Summer Night Market', city: 'Melbourne', venueName: 'Queen Victoria Market', venueAddress: 'Queen St, Melbourne VIC 3000', url: 'https://thenightmarket.com.au/',
    description: 'Melbourne’s favourite Wednesday night out in summer: global street food, bars, live music and makers’ stalls.', slots: [{ days: [3], start: '17:00', end: '22:00' }], season: { from: '11-18', to: '03-12' }, isFree: true, genres: ['market', 'food'] },
  { title: 'Queen Victoria Winter Night Market', city: 'Melbourne', venueName: 'Queen Victoria Market', venueAddress: 'Queen St, Melbourne VIC 3000', url: 'https://thenightmarket.com.au/',
    description: 'Wednesday winter night market: fire pits, hearty street food, mulled wine and live music.', slots: [{ days: [3], start: '17:00', end: '22:00' }], season: { from: '06-01', to: '09-10' }, isFree: true, genres: ['market', 'food'] },
  { title: 'South Melbourne Market', city: 'Melbourne', venueName: 'South Melbourne Market', venueAddress: 'Cnr Coventry & Cecil Sts, South Melbourne VIC 3205', url: 'https://www.southmelbournemarket.com.au/',
    description: 'Much-loved neighbourhood market famous for dim sims, oysters, produce and laneway eateries.', slots: [{ days: [3, 6, 0], start: '08:00', end: '16:00' }, { days: [5], start: '08:00', end: '17:00' }], isFree: true, genres: ['market', 'food'] },
  { title: 'Rose Street Artists’ Market', city: 'Melbourne', venueName: 'Rose Street Artists’ Market', venueAddress: '60 Rose St, Fitzroy VIC 3065', url: 'https://www.rosestmarket.com.au/',
    description: 'Fitzroy’s weekend design market with 120+ local makers: art, ceramics, jewellery and homewares, fully covered.', slots: [{ days: WEEKEND, start: '10:00', end: '16:00' }], isFree: true, genres: ['market', 'art'] },

  // ── Brisbane ───────────────────────────────────────────
  { title: 'Eat Street Northshore', city: 'Brisbane', venueName: 'Eat Street Northshore', venueAddress: '221D MacArthur Ave, Hamilton QLD 4007', url: 'https://www.eatstreetnorthshore.com.au/',
    description: 'Brisbane’s iconic shipping-container food market on the river: 70+ food stalls, bars and live music.', slots: [{ days: [5, 6], start: '16:00', end: '22:00' }, { days: [0], start: '16:00', end: '21:00' }], price: '$6', genres: ['market', 'food'] },
  { title: 'West End Markets (Davies Park)', city: 'Brisbane', venueName: 'Davies Park', venueAddress: 'Montague Rd, West End QLD 4101', url: 'https://daviesparkmarket.com.au/',
    description: 'Saturday market under giant fig trees: 150+ stalls of produce, healthy food, crafts, flowers and live entertainment.', slots: [{ days: [6], start: '06:00', end: '14:00' }], isFree: true, genres: ['market', 'food'] },

  // ── Gold Coast ─────────────────────────────────────────
  { title: 'Miami Marketta Street Food Market', city: 'Gold Coast', venueName: 'Miami Marketta', venueAddress: '23 Hillcrest Pde, Miami QLD 4220', url: 'https://www.miamimarketta.com/',
    description: 'The Gold Coast’s favourite night market: global street food, boutique bars and live music in an undercover laneway.', slots: [{ days: [3, 5, 6], start: '17:00', end: '22:00' }], isFree: true, genres: ['market', 'food'] },
  { title: 'Carrara Markets', city: 'Gold Coast', venueName: 'Carrara Markets', venueAddress: 'Cnr Gooding Dr & Manchester Rd, Carrara QLD 4211', url: 'https://www.carraramarkets.com.au/',
    description: 'The Gold Coast’s largest market: 300+ stalls of produce, plants, fashion, antiques and a food court, with free parking.', slots: [{ days: WEEKEND, start: '08:00', end: '15:00' }], isFree: true, genres: ['market'] },

  // ── Perth ──────────────────────────────────────────────
  { title: 'Fremantle Markets', city: 'Perth', venueName: 'Fremantle Markets', venueAddress: 'Cnr South Tce & Henderson St, Fremantle WA 6160', url: 'https://fremantlemarkets.com.au/',
    description: 'Heritage-listed market hall since 1897: 150+ stalls of local produce, food, crafts and buskers.', slots: [{ days: [5, 6, 0], start: '09:00', end: '18:00' }], isFree: true, genres: ['market', 'food'] },
  { title: 'Twilight Food Market', city: 'Perth', venueName: 'Forrest Place', venueAddress: 'Forrest Pl, Perth WA 6000', url: 'https://visitperth.com/events/twilight-food-market',
    description: 'Perth’s Friday-night open-air street food market with 37+ vendors from around the world.', slots: [{ days: [5], start: '16:30', end: '21:30' }], season: { from: '10-01', to: '04-25' }, isFree: true, genres: ['market', 'food'] },

  // ── Adelaide ───────────────────────────────────────────
  { title: 'Adelaide Central Market', city: 'Adelaide', venueName: 'Adelaide Central Market', venueAddress: '44-60 Gouger St, Adelaide SA 5000', url: 'https://adelaidecentralmarket.com.au/',
    description: 'One of the largest undercover fresh produce markets in the Southern Hemisphere, with late-night Fridays.', slots: [{ days: [2], start: '07:00', end: '17:30' }, { days: [3, 4], start: '09:00', end: '17:30' }, { days: [5], start: '07:00', end: '21:00' }, { days: [6], start: '07:00', end: '15:00' }], isFree: true, genres: ['market', 'food'] },
  { title: 'Adelaide Showground Farmers Market', city: 'Adelaide', venueName: 'Adelaide Showground', venueAddress: 'Rose Tce, Wayville SA 5034', url: 'https://adelaidefarmersmarket.com.au/',
    description: 'Adelaide’s favourite Sunday farmers market: SA produce, breakfast and coffee in the Stirling Angas Pavilion.', slots: [{ days: [0], start: '08:30', end: '12:30' }], isFree: true, genres: ['market', 'food'] },

  // ── Canberra ───────────────────────────────────────────
  { title: 'Old Bus Depot Markets', city: 'Canberra', venueName: 'Old Bus Depot Markets', venueAddress: '21 Wentworth Ave, Kingston ACT 2604', url: 'https://obdm.com.au/',
    description: 'Canberra’s much-loved indoor Sunday market: 200+ stalls of handmade goods, local art and gourmet food.', slots: [{ days: [0], start: '09:30', end: '14:30' }], isFree: true, genres: ['market'] },
  { title: 'Capital Region Farmers Market', city: 'Canberra', venueName: 'Exhibition Park in Canberra (EPIC)', venueAddress: 'Flemington Rd, Mitchell ACT 2911', url: 'https://capitalregionfarmersmarket.com.au/',
    description: 'Canberra’s big Saturday farmers market with 100+ stalls of produce, meat, seafood and baked goods.', slots: [{ days: [6], start: '07:00', end: '11:30' }], isFree: true, genres: ['market', 'food'] },

  // ── Newcastle ──────────────────────────────────────────
  { title: 'Newcastle City Farmers Market', city: 'Newcastle', venueName: 'Newcastle Showground', venueAddress: 'Griffiths Rd, Broadmeadow NSW 2292', url: 'https://newcastlecityfarmersmarket.com.au/',
    description: 'Newcastle’s popular Sunday farmers market: local produce, seafood, cheese, wine and food trucks, undercover.', slots: [{ days: [0], start: '07:00', end: '13:00' }], isFree: true, genres: ['market', 'food'] },

  // ── Hobart ─────────────────────────────────────────────
  { title: 'Salamanca Market', city: 'Hobart', venueName: 'Salamanca Place', venueAddress: 'Salamanca Pl, Hobart TAS 7000', url: 'https://www.salamancamarket.com.au/',
    description: 'Tasmania’s famous Saturday market: 300+ stalls of Tasmanian art, craft, produce and food among historic sandstone warehouses.', slots: [{ days: [6], start: '08:30', end: '15:00' }], isFree: true, genres: ['market'] },
  { title: 'Farm Gate Market', city: 'Hobart', venueName: 'Farm Gate Market', venueAddress: 'Bathurst St, Hobart TAS 7000', url: 'https://hobartandbeyond.com.au/blog/a-guide-to-local-markets/',
    description: 'Hobart’s Sunday paddock-to-plate farmers market: seasonal produce, cheese, bread and local food.', slots: [{ days: [0], start: '08:30', end: '13:00' }], isFree: true, genres: ['market', 'food'] },

  // ── Darwin ─────────────────────────────────────────────
  { title: 'Mindil Beach Sunset Market', city: 'Darwin', venueName: 'Mindil Beach', venueAddress: 'Maria Liddell Dr, The Gardens NT 0820', url: 'https://mindil.com.au/',
    description: 'Darwin’s legendary dry-season sunset market on the beach: food from around the world, crafts and street performers.', slots: [{ days: [4, 0], start: '16:00', end: '21:00' }], season: { from: '04-24', to: '10-30' }, isFree: true, genres: ['market', 'food'] },
  { title: 'Parap Village Markets', city: 'Darwin', venueName: 'Parap Village', venueAddress: 'Parap Rd, Parap NT 0820', url: 'https://parapvillage.com.au/saturday-markets/',
    description: 'Darwin’s Saturday morning institution: famous laksa, tropical produce, Aboriginal art and live entertainment.', slots: [{ days: [6], start: '08:00', end: '14:00' }], isFree: true, genres: ['market', 'food'] },
  { title: 'Nightcliff Markets', city: 'Darwin', venueName: 'Nightcliff Village', venueAddress: 'Pavonia Pl, Nightcliff NT 0810', url: 'https://discover.darwin.nt.gov.au/blogs/darwin-markets',
    description: 'Relaxed Sunday market in shady Nightcliff Village: food, local musicians, clothing and handmade goods.', slots: [{ days: [0], start: '08:00', end: '14:00' }], isFree: true, genres: ['market'] },
]

/** Recurring listings are materialised this far ahead (~15 months), so a full season and the next one stay on the board. */
const DAYS_AHEAD = 457

function inSeason(mmdd: string, s?: { from: string; to: string }): boolean {
  if (!s) return true
  return s.from <= s.to ? mmdd >= s.from && mmdd <= s.to : mmdd >= s.from || mmdd <= s.to
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Generates occurrences for every curated regular, through DAYS_AHEAD, skipping dates outside a season window. */
export async function fetchCuratedEvents(): Promise<number> {
  let saved = 0
  for (const c of CURATED) {
    if (yieldIfBudget('curated listings')) break
    const tz = CITIES.find((x) => x.name === c.city)?.tz ?? 'Australia/Sydney'
    const today = toSydneyParts(new Date(), tz).date
    const base = { title: c.title, description: c.description, venueName: c.venueName, venueAddress: c.venueAddress,
      sourceUrl: c.url, organiserUrl: c.url, isFree: c.isFree, price: c.price ?? null, genres: c.genres, source: 'curated', city: c.city }

    if (c.once) {
      if (c.once.end < today) continue
      const date = c.once.start > today ? c.once.start : today
      if (await saveEvent({ ...base, date, endDate: c.once.end, time: c.once.time, endTime: c.once.endTime })) saved++
      continue
    }

    for (let i = 0; i < DAYS_AHEAD; i++) {
      if (i % 20 === 0 && yieldIfBudget('curated listings')) break
      const date = addDays(today, i)
      if (!inSeason(date.slice(5), c.season)) continue
      const dow = new Date(`${date}T00:00:00.000Z`).getUTCDay()
      const slot = c.slots?.find((s) => s.days.includes(dow))
      if (!slot) continue
      if (await saveEvent({ ...base, date, time: slot.start, endTime: slot.end })) saved++
    }
    noteSourceSaved(saved)
  }
  return saved
}
