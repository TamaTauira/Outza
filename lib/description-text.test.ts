import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cosDescriptionFromHtml,
  descriptionParagraphs,
  descriptionUpdate,
  eventbriteDescriptionFromHtml,
  humanitixDescriptionFromHtml,
  keepStoredDescription,
  moshtixListingDescription,
  paragraphsFromHtml,
  preferDescription,
  sanitizeDescription,
} from './description-text'
import { cosHitsFromHtml, cosPriceText, cosWhen } from './cos-event'
import { mapsDirectionsUrl } from './place'

const POLE = '<p>Miss Pole Dance Australia, the world\'s longest running pole comp is next level entertaining.</p><p>The best of the best from around Australia will compete for the title.</p>'

test('html becomes paragraphs and tags do not survive', () => {
  const text = paragraphsFromHtml(`${POLE}<script>alert(1)</script>`)
  assert.equal(text.includes('<'), false)
  assert.equal(text.includes('alert'), false)
  assert.match(text, /Miss Pole Dance Australia/)
  assert.match(text, /\n\nThe best of the best/)
  assert.equal(descriptionParagraphs(text).length, 2)
})

test('a City of Sydney page keeps the description, not the strapline', () => {
  const html = `<script type="application/json" id="__JSS_STATE__">${JSON.stringify({
    sitecore: { context: { eventDetail: { strapline: 'The original pole dancing championships', description: POLE } } },
  })}</script>`
  const text = cosDescriptionFromHtml(html)
  assert.match(text ?? '', /longest running pole comp/)
  assert.doesNotMatch(text ?? '', /original pole dancing championships/)
})

test('a short strapline does not replace the full write-up', () => {
  const full = paragraphsFromHtml(POLE + '<p>It will surprise you and leave you inspired and awed at the sheer talent.</p>')
  assert.equal(keepStoredDescription(full, 'The original pole dancing championships'), true)
  assert.equal(descriptionUpdate(full, 'The original pole dancing championships'), null)
  assert.match(descriptionUpdate('The original pole dancing championships', full) ?? '', /sheer talent/)
  assert.equal(descriptionUpdate(full, full), null)
})

test('Moshtix uses the description when the teaser is just the door time', () => {
  const text = moshtixListingDescription(
    'DOORS 7:30PM | SHOW 9PM',
    '<p>Grammy-nominated duo DOMi &amp; JD BECK bring the tour back to intimate theatres. The band plays two sets and stays for a hang.</p>',
  )
  assert.match(text ?? '', /intimate theatres/)
  assert.doesNotMatch(text ?? '', /DOORS 7:30PM/)
  assert.equal(moshtixListingDescription('A proper teaser with enough words to stand as the listing when the description is blank.', ''), 'A proper teaser with enough words to stand as the listing when the description is blank.')
})

test('Eventbrite structured text beats the card summary', () => {
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { context: {
      basicInfo: { summary: 'You are looking at this event for a purpose.' },
      structuredContent: { modules: [
        { type: 'image', text: null },
        { type: 'text', text: '<p>Thirty other business leaders will help you meet the room.</p><p>Arrive early and say hello.</p>' },
      ] },
    } } },
  })}</script>`
  const text = eventbriteDescriptionFromHtml(html)
  assert.match(text ?? '', /Thirty other business leaders/)
  assert.match(text ?? '', /\n\nArrive early/)
})

test('Humanitix rich text is the description, not the buy-tickets line', () => {
  const content = JSON.stringify('<p>Roll out the red carpet.</p><p>It is glow time.</p>').slice(1, -1)
  const html = `<script>eventModules:[{component:"richtext",props:{title:"Description",content:"${content}"}}]</script>`
  assert.match(humanitixDescriptionFromHtml(html) ?? '', /red carpet/)
  assert.equal(humanitixDescriptionFromHtml('<script type="application/ld+json">{"description":"Buy Tickets on Humanitix - a party."}</script>'), null)
})

test('City of Sydney times land on the Sydney wall clock', () => {
  const allDay = cosWhen({
    upcomingDateStart: '2026-11-10T13:00:00.000Z',
    upcomingDateEnd: '2026-11-11T12:59:59.000Z',
    isUpcomingAllDayEvent: true,
  })
  assert.equal(allDay.date, '2026-11-11')
  assert.equal(allDay.time, '00:00')
  assert.equal(allDay.endTime, '23:59')
  const timed = cosWhen({ upcomingDateStart: '2026-11-10T20:00:00.000Z', upcomingDateEnd: '2026-11-11T04:00:00.000Z', isUpcomingAllDayEvent: false })
  assert.equal(timed.date, '2026-11-11')
  assert.equal(timed.time, '07:00')
  assert.equal(timed.endTime, '15:00')
  assert.equal(cosPriceText([{ category: 'Starting from', value: '145.00' }]), 'From $145')
})

test('search state and a legacy strapline hit both yield events', () => {
  const html = `<script type="application/json" id="__JSS_STATE__">${JSON.stringify({
    sitecore: { context: { eventSearchPrefetch: [{ data: { events: [{ slug: 'pole', strapline: 'short', name: 'Miss Pole' }] } }] } },
  })}</script>`
  assert.equal(cosHitsFromHtml(html)[0]?.slug, 'pole')
  const legacy = cosWhen({ upcomingDate: '2026-12-01', eventUpcomingTime: '7:30pm to 10pm' })
  assert.equal(legacy.date, '2026-12-01')
  assert.equal(legacy.time, '19:30')
  assert.equal(legacy.endTime, '22:00')
})

test('the address opens directions and an online listing does not', () => {
  const street = mapsDirectionsUrl({
    venueAddress: '58 Riley St, Darlinghurst NSW 2010',
    venueName: 'KiKi',
    city: 'Sydney',
    latitude: -33.87,
    longitude: 151.21,
  })
  assert.match(street ?? '', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/)
  assert.match(decodeURIComponent(street ?? ''), /58 Riley St/)
  assert.equal(mapsDirectionsUrl({ venueName: 'Online', venueAddress: 'Online, NSW', latitude: -33.6, longitude: 150.75 }), null)
  const pin = mapsDirectionsUrl({ venueName: 'The Calyx', venueAddress: 'The Calyx', latitude: -33.864, longitude: 151.215, city: 'Sydney' })
  assert.match(decodeURIComponent(pin ?? ''), /-33\.864,151\.215/)
})

test('preferDescription skips a dot and keeps the note', () => {
  assert.equal(preferDescription('.', 'Doors at seven, the band at nine, home before the trains stop.'), 'Doors at seven, the band at nine, home before the trains stop.')
  const saved = sanitizeDescription('<p>Night market 🥳</p>\n\nSecond line')
  assert.match(saved, /Night market 🥳/)
  assert.match(saved, /Second line/)
  assert.equal(saved.includes('<p>'), false)
})
