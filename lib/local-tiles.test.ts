import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { COMMUNITY_SECTIONS } from './community-shared'
import { CORNER_LOCAL_CATEGORY, LOCAL_TILES, LOCAL_TILE_LICENCE, localCategoryPath, moreTiles, primaryTiles } from './local-tiles'

test('Local shortcuts filter real sections and use the approved mascot art', () => {
  assert.deepEqual(primaryTiles().map((tile) => tile.label), ['Garage Sales', 'Markets', 'School Fetes', 'Fundraisers', 'Pop-ups', 'Community Events'])
  assert.deepEqual(moreTiles().map((tile) => tile.key), ['warehouse-sales', 'dog-friendly', 'local-art'])
  const withArt = LOCAL_TILES.filter((tile) => tile.src)
  assert.equal(withArt.length, 9)
  assert.equal(LOCAL_TILES.find((tile) => tile.key === 'charity-events')?.src, '/local-tiles/school-fundraiser.webp')
  for (const tile of LOCAL_TILES) {
    assert.ok(COMMUNITY_SECTIONS.some((section) => section.key === tile.key), tile.key)
    if (!tile.src || !tile.srcSmall) continue
    assert.match(tile.src, /^\/local-tiles\/.+\.webp$/)
    assert.match(tile.srcSmall, /-480\.webp$/)
    assert.ok(tile.alt.length > 10)
    assert.ok(existsSync(`public${tile.src}`))
    assert.ok(existsSync(`public${tile.srcSmall}`))
  }
  assert.match(LOCAL_TILE_LICENCE, /VibePeep/)
})

test('corner buttons open Local with the category it already filters on', () => {
  assert.equal(localCategoryPath('garage-sales'), '/local?category=garage-sales')
  assert.equal(localCategoryPath('farmers-markets'), '/local?category=farmers-markets')
  assert.equal(localCategoryPath('school-fundraisers'), '/local?category=school-fundraisers')
  assert.equal(localCategoryPath('community-sport'), '/local?category=community-sport')
  assert.equal(localCategoryPath('neighbourhood-popups'), '/local?category=neighbourhood-popups')
  assert.equal(CORNER_LOCAL_CATEGORY.workshops, 'neighbourhood-popups')
  assert.equal(localCategoryPath('workshops'), '/local?category=neighbourhood-popups')
  for (const key of Object.values(CORNER_LOCAL_CATEGORY)) {
    assert.ok(LOCAL_TILES.some((tile) => tile.key === key), key)
  }
})
