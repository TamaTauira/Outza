// Venue coordinates → official ABS ASGS 2021 areas via the ABS geospatial services (point-in-polygon).
import { prisma } from '@/lib/prisma'

const BASE = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021'

async function lookup(layer: 'SA2' | 'LGA' | 'POA' | 'SAL', lat: number, lng: number): Promise<Record<string, string> | null> {
  const url = `${BASE}/${layer}/MapServer/0/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
      if (res.ok) { const j = await res.json(); return j?.features?.[0]?.attributes ?? null }
    } catch {}
    await new Promise((r) => setTimeout(r, 800 * (i + 1)))
  }
  throw new Error(`ABS geography service unavailable (${layer})`)
}

export const geoKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`

export type VenueGeo = Awaited<ReturnType<typeof resolveVenueGeo>>

export async function resolveVenueGeo(lat: number, lng: number) {
  const key = geoKey(lat, lng)
  const cached = await prisma.intelVenueGeo.findUnique({ where: { key } })
  if (cached) return cached
  const [sa2, lga, poa, sal] = await Promise.all([lookup('SA2', lat, lng), lookup('LGA', lat, lng), lookup('POA', lat, lng), lookup('SAL', lat, lng)])
  const data = {
    key, lat, lng,
    sa2: sa2?.sa2_code_2021 ?? null, sa2Name: sa2?.sa2_name_2021 ?? null, sa3: sa2?.sa3_code_2021 ?? null, sa3Name: sa2?.sa3_name_2021 ?? null,
    sa4: sa2?.sa4_code_2021 ?? null, sa4Name: sa2?.sa4_name_2021 ?? null, gccsa: sa2?.gcc_code_2021 ?? sa2?.gccsa_code_2021 ?? null, gccsaName: sa2?.gcc_name_2021 ?? sa2?.gccsa_name_2021 ?? null,
    state: sa2?.state_code_2021 ?? lga?.state_code_2021 ?? null, lga: lga?.lga_code_2021 ?? null, lgaName: lga?.lga_name_2021 ?? null,
    poa: poa?.poa_code_2021 ?? null, sal: sal?.sal_code_2021 ?? null, salName: sal?.sal_name_2021 ?? null,
  }
  const row = await prisma.intelVenueGeo.upsert({ where: { key }, create: data, update: data })
  const areas = [['SA2', data.sa2, data.sa2Name], ['SA3', data.sa3, data.sa3Name], ['SA4', data.sa4, data.sa4Name], ['LGA', data.lga, data.lgaName], ['SAL', data.sal, data.salName], ['POA', data.poa, data.poa ? `Postcode ${data.poa}` : null]] as const
  for (const [t, c, n] of areas) if (c && n) await prisma.intelArea.upsert({ where: { id: `${t}:${c}` }, create: { id: `${t}:${c}`, geoType: t, code: c, name: n }, update: { name: n } })
  return row
}
