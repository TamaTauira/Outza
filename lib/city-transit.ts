import { requireEveryCity } from '@/lib/cities'

/**
 * One public-transport planner per catalogue city.
 * Outing tips and the event page both read this. Do not keep a second copy.
 */
export const CITY_TRANSIT: Record<string, { name: string; url: string }> = {
  Sydney: { name: 'Transport NSW', url: 'https://transportnsw.info/trip' },
  Newcastle: { name: 'Transport NSW', url: 'https://transportnsw.info/trip' },
  Wollongong: { name: 'Transport NSW', url: 'https://transportnsw.info/trip' },
  Melbourne: { name: 'PTV', url: 'https://www.ptv.vic.gov.au/journey' },
  Brisbane: { name: 'Translink', url: 'https://jp.translink.com.au/plan-your-journey/journey-planner' },
  'Gold Coast': { name: 'Translink', url: 'https://jp.translink.com.au/plan-your-journey/journey-planner' },
  Perth: { name: 'Transperth', url: 'https://www.transperth.wa.gov.au/Journey-Planner' },
  Adelaide: { name: 'Adelaide Metro', url: 'https://www.adelaidemetro.com.au/planner' },
  Canberra: { name: 'Transport Canberra', url: 'https://www.transport.act.gov.au/' },
  Hobart: { name: 'Metro Tasmania', url: 'https://www.metrotas.com.au/' },
  Darwin: { name: 'Darwinbus', url: 'https://nt.gov.au/driving/public-transport-cycling/public-buses' },
}

requireEveryCity('public transport planners', Object.keys(CITY_TRANSIT))
