import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { COMMUNITY_SECTIONS } from './community-shared'
import { LOCAL_TILES, LOCAL_TILE_LICENCE, moreTiles, primaryTiles } from './local-tiles'

test('Local shortcuts filter real sections and use the approved mascot art', () => {
  assert.deepEqual(primaryTiles().map((tile) => tile.label), ['Garage Sales', 'Markets', 'School Fetes', 'Fundraisers', 'Pop-ups', 'Community Events'])
  assert.deepEqual(moreTiles().map((tile) => tile.key), ['warehouse-sales', 'dog-friendly', 'local-art'])
  const withArt = LOCAL_TILES.filter((tile) => tile.src)
  assert.equal(withArt.length, 8)
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
  assert.equal(LOCAL_TILES.find((tile) => tile.key === 'charity-events')?.src, null)
})
