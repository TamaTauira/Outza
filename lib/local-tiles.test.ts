import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COMMUNITY_SECTIONS } from './community-shared'
import { LOCAL_TILES } from './local-tiles'

test('category tiles match real Local sections and name a licence', () => {
  assert.equal(LOCAL_TILES.length, 8)
  for (const tile of LOCAL_TILES) {
    const section = COMMUNITY_SECTIONS.find((item) => item.key === tile.key)
    assert.ok(section, tile.key)
    assert.equal(tile.label, section?.short)
    assert.match(tile.src, /^\/local-tiles\/.+\.webp$/)
    assert.ok(tile.credit.author)
    assert.match(tile.credit.licence, /^CC/)
    assert.match(tile.credit.licenceUrl, /^https:\/\/creativecommons\.org\//)
    assert.match(tile.credit.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
  }
})
