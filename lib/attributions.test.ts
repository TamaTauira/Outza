import assert from 'node:assert/strict'
import test from 'node:test'
import { ABS_CENSUS_CREDIT, ABS_HSI_CREDIT, ABS_HOME, ABS_REGION_CREDIT, ABS_SEIFA_CREDIT, ATTRIBUTIONS, CC_BY_4 } from './attributions'
import { MAP_ATTRIBUTION } from './map-style'

test('SEIFA and the other ABS sets name the dataset and CC BY 4.0', () => {
  assert.equal(ABS_SEIFA_CREDIT, 'Source: Australian Bureau of Statistics, SEIFA 2021, CC BY 4.0')
  assert.match(ABS_REGION_CREDIT, /Data by Region/)
  assert.match(ABS_CENSUS_CREDIT, /2021 Census/)
  assert.match(ABS_HSI_CREDIT, /Household Spending Indicator/)
  for (const row of ATTRIBUTIONS.filter((item) => item.name.startsWith('ABS'))) {
    assert.equal(row.licenceUrl, CC_BY_4)
    assert.match(row.url, /^https:\/\/www\.abs\.gov\.au\//)
  }
  assert.equal(ABS_HOME, 'https://www.abs.gov.au/')
})

test('map tiles credit OpenFreeMap, OpenMapTiles and OpenStreetMap with links', () => {
  assert.match(MAP_ATTRIBUTION, /openfreemap\.org/)
  assert.match(MAP_ATTRIBUTION, /openmaptiles\.org/)
  assert.match(MAP_ATTRIBUTION, /openstreetmap\.org\/copyright/)
  assert.match(MAP_ATTRIBUTION, /contributors/)
  assert.ok(ATTRIBUTIONS.some((row) => row.name === 'OpenFreeMap'))
})
