import assert from 'node:assert/strict'
import test from 'node:test'
import { frontierExternalId, frontierShowsFromHtml } from './frontier-shows'

const html = `
<script type="application/ld+json">
[{"@type":"MusicEvent","name":"Benson Boone 2026","startDate":"2026-11-14","url":"https://frontiertouringcom.coredna.site/bensonboone","location":{"name":"Rod Laver Arena, Melbourne"}},
{"@type":"MusicEvent","name":"Khalid 2026","startDate":"2026-11-11","url":"https://frontiertouringcom.coredna.site/khalid","location":{"name":"Riverstage , Brisbane"}},
{"@type":"MusicEvent","name":"Benson Boone 2026","startDate":"2026-11-06","url":"https://frontiertouringcom.coredna.site/bensonboone","location":{"name":"Brisbane Entertainment Centre, Brisbane"}}]
</script>`

test('each Frontier date keeps its own venue and source id', () => {
  const shows = frontierShowsFromHtml(html)
  assert.equal(shows.length, 3)
  const melbourne = shows.find((show) => show.date === '2026-11-14')
  assert.equal(melbourne?.venueName, 'Rod Laver Arena')
  assert.equal(melbourne?.city, 'Melbourne')
  assert.equal(melbourne?.externalId, 'bensonboone|2026-11-14')
  const river = shows.find((show) => show.title === 'Khalid')
  assert.equal(river?.venueName, 'Riverstage')
  assert.equal(river?.city, 'Brisbane')
  assert.notEqual(frontierExternalId(shows[0].url, shows[0].date), frontierExternalId(shows[2].url, shows[2].date))
})
