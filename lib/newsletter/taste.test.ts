import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertPublicImageUrl, emailImageSrc } from './images'
import { buildProfile, rankDigest, trustLine, type DigestEvent, type RankOpts } from './taste'

const FROM = new Date('2026-10-29T00:00:00.000Z')
const TO = new Date('2026-11-05T00:00:00.000Z')

function opts(extra: Partial<RankOpts> = {}): RankOpts {
  return {
    from: FROM,
    to: TO,
    savedUntil: new Date('2026-11-19T00:00:00.000Z'),
    todayKey: '2026-10-29',
    nowMin: 14 * 60,
    weekend: { from: '2026-10-30', to: '2026-11-01' },
    seen: new Set(),
    promoIds: new Set(),
    ...extra,
  }
}

function ev(over: Partial<DigestEvent> & Pick<DigestEvent, 'id' | 'title'>): DigestEvent {
  return {
    description: null,
    date: new Date('2026-10-30T00:00:00.000Z'),
    endDate: null,
    time: '20:00',
    venueName: 'The Imperial',
    suburb: 'Newtown',
    city: 'Sydney',
    category: 'Music',
    subTags: [],
    isFree: false,
    isLGBTI: false,
    priceMin: 25,
    imageUrl: 'https://cdn.example/gig.jpg',
    hasImage: true,
    ageRestriction: null,
    latitude: null,
    longitude: null,
    status: 'SCHEDULED',
    duplicateOfId: null,
    source: 'ticketmaster',
    lastVerifiedAt: new Date('2026-10-28T00:00:00.000Z'),
    updatedAt: new Date('2026-10-28T00:00:00.000Z'),
    popularity: 2,
    createdAt: new Date('2026-10-20T00:00:00.000Z'),
    ...over,
  }
}

test('a known taste gets a first-name greeting and a line about what they peep', () => {
  const profile = buildProfile({
    name: 'Sam Taylor',
    city: 'Sydney',
    preferredCategories: ['Arts & Culture'],
    venueNames: [],
    vibe: { vibes: ['Comedy', 'Bars & cocktails'] },
    saved: [{ id: 's1', title: 'Late show', category: 'Arts & Culture', venueName: 'The Imperial', suburb: 'Newtown', subTags: ['Comedy'] }],
  })
  assert.equal(profile.greeting, 'Hey Sam,')
  assert.match(profile.intro, /You've been peeping at comedy and Newtown bars/)
  assert.equal(profile.thin, false)
  assert.equal(profile.becauseTitle, 'Because you liked comedy')
})

test('someone with no signals gets the city fallback, not a fake personal history', () => {
  const profile = buildProfile({
    name: 'Alex',
    city: 'Sydney',
    homePostcode: '2010',
    preferredCategories: [],
    venueNames: [],
    saved: [],
  })
  assert.equal(profile.greeting, 'Hey Alex,')
  assert.equal(profile.thin, true)
  assert.match(profile.intro, /new on our radar/)
  assert.match(profile.intro, /Sydney/)
  assert.match(profile.intro, /Sydney CBD & inner city/)
  assert.doesNotMatch(profile.intro, /Verified|confidence/i)
})

test('ranking explains follows, suburbs and saved gigs, and skips past, duplicate and started events', () => {
  const profile = buildProfile({
    name: 'Sam',
    city: 'Sydney',
    preferredCategories: ['Music'],
    venueNames: ['Enmore Theatre'],
    vibe: { vibes: ['Live gigs'], spend: ['Under $30'], crew: ['Family with kids'] },
    saved: [{ id: 'saved-gig', title: 'Old favourite', category: 'Music', venueName: 'The Factory', suburb: 'Surry Hills', subTags: [] }],
    viewed: [{ id: 'viewed-1', title: 'A play', category: 'Arts & Culture', venueName: 'STC', suburb: 'Sydney', subTags: [] }],
  })
  const events = [
    ev({ id: 'past', title: 'Already happened', date: new Date('2026-10-20T00:00:00.000Z') }),
    ev({ id: 'dup', title: 'Shadow listing', duplicateOfId: 'real' }),
    ev({ id: 'started', title: 'On now', date: new Date('2026-10-29T00:00:00.000Z'), time: '09:00' }),
    ev({ id: 'saved-gig', title: 'Old favourite', date: new Date('2026-10-31T00:00:00.000Z'), venueName: 'The Factory', suburb: 'Surry Hills' }),
    ev({ id: 'like-gig', title: 'Another band', date: new Date('2026-10-30T00:00:00.000Z'), category: 'Music', suburb: 'Surry Hills', venueName: 'The Factory Floor' }),
    ev({ id: 'venue', title: 'Headline set', date: new Date('2026-11-01T00:00:00.000Z'), venueName: 'Enmore Theatre', suburb: 'Newtown', category: 'Music' }),
    ev({ id: 'near', title: 'Street fair', date: new Date('2026-10-31T00:00:00.000Z'), category: 'Community', suburb: 'Surry Hills', venueName: 'Crown Street' }),
    ev({ id: 'adults', title: '18+ club night', category: 'Nightlife', ageRestriction: '18+', date: new Date('2026-10-30T00:00:00.000Z') }),
    ev({ id: 'free', title: 'Park gig', isFree: true, priceMin: 0, category: 'Music', date: new Date('2026-11-01T00:00:00.000Z'), suburb: 'Glebe' }),
    ev({ id: 'same-name', title: 'Another band', category: 'Music', date: new Date('2026-11-02T00:00:00.000Z') }),
  ]
  const picked = rankDigest(events, profile, opts())
  const ids = [picked.hero, ...picked.weekend, ...picked.because, ...picked.saved, ...picked.free, ...picked.popular].filter(Boolean).map((e) => e!.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids.includes('past'), false)
  assert.equal(ids.includes('dup'), false)
  assert.equal(ids.includes('started'), false)
  assert.equal(ids.includes('adults'), false)
  const like = [picked.hero, ...picked.weekend, ...picked.because].find((e) => e?.id === 'like-gig')
  assert.equal(like?.whyLine, 'Like the gig you saved')
  const venue = [picked.hero, ...picked.weekend, ...picked.because].find((e) => e?.id === 'venue')
  assert.equal(venue?.whyLine, 'Because you follow Enmore Theatre')
  const near = [picked.hero, ...picked.weekend, ...picked.because, ...picked.saved].find((e) => e?.id === 'near')
  assert.equal(near?.whyLine, 'Near Surry Hills')
  assert.equal(picked.saved.some((e) => e.id === 'saved-gig'), true)
  assert.match(picked.saved.find((e) => e.id === 'saved-gig')?.whyLine ?? '', /watchlist|Together|itinerary|follow|Near|peep|gig/)
  assert.equal(ids.filter((id) => id === 'like-gig' || id === 'same-name').length <= 1, true)
  const titles = [picked.hero, ...picked.weekend, ...picked.because, ...picked.free].map((e) => e?.title.toLowerCase())
  assert.equal(titles.filter((t) => t?.startsWith('another band')).length <= 1, true)
})

test('a thin profile falls back to popular events in their city', () => {
  const profile = buildProfile({ name: 'Jamie', city: 'Sydney', preferredCategories: [], venueNames: [], saved: [] })
  const events = [
    ev({ id: 'quiet', title: 'Quiet one', popularity: 0, hasImage: false, imageUrl: null, date: new Date('2026-11-04T00:00:00.000Z') }),
    ev({ id: 'busy', title: 'Busy one', popularity: 40, category: 'Community', date: new Date('2026-10-31T00:00:00.000Z') }),
    ev({ id: 'also', title: 'Also busy', popularity: 20, category: 'Sports', date: new Date('2026-11-04T00:00:00.000Z') }),
  ]
  const picked = rankDigest(events, profile, opts())
  assert.equal(picked.thin, true)
  assert.equal(picked.hero?.id, 'busy')
  assert.match(picked.hero?.whyLine ?? '', /Popular in Sydney/)
  assert.equal(picked.because.length, 0)
  assert.ok(picked.popular.length >= 1)
  assert.match(picked.intro, /new on our radar/)
})

test('free-only taste keeps paid events out of the hero and shows a free section', () => {
  const profile = buildProfile({
    name: 'Sam',
    city: 'Sydney',
    preferredCategories: [],
    venueNames: [],
    vibe: { spend: ['Free is my favourite price'] },
    saved: [{ id: 's', title: 'Market', category: 'Community', venueName: 'Square', suburb: 'Glebe', subTags: [] }],
  })
  const events = [
    ev({ id: 'paid', title: 'Pricey dinner', category: 'Food & Drink', priceMin: 120, popularity: 30 }),
    ev({ id: 'free', title: 'Twilight market', category: 'Community', isFree: true, priceMin: 0, popularity: 4, suburb: 'Glebe' }),
    ev({ id: 'lawn', title: 'Park screening', category: 'Film', isFree: true, priceMin: 0, popularity: 1, suburb: 'Redfern', date: new Date('2026-11-04T00:00:00.000Z') }),
  ]
  const picked = rankDigest(events, profile, opts())
  assert.equal(picked.hero?.isFree, true)
  assert.ok(picked.free.length >= 1)
  assert.match([picked.hero, ...picked.free].map((e) => e?.whyLine).join(' '), /Free, the way you like it/)
})

test('a big spender does not get a free section they did not ask for', () => {
  const profile = buildProfile({
    name: 'Sam',
    city: 'Sydney',
    preferredCategories: ['Music'],
    venueNames: [],
    vibe: { spend: ['$150+'] },
    saved: [{ id: 's', title: 'Gala', category: 'Music', venueName: 'Opera House', suburb: 'Sydney', subTags: [] }],
  })
  const picked = rankDigest([
    ev({ id: 's', title: 'Gala', isFree: false, priceMin: 180 }),
    ev({ id: 'free', title: 'Free choir', isFree: true, priceMin: 0, category: 'Music' }),
  ], profile, opts())
  assert.equal(profile.freeRelevant, false)
  assert.equal(picked.free.length, 0)
})

test('same-day saved stops include a travel time', () => {
  const profile = buildProfile({
    name: 'Sam',
    city: 'Sydney',
    preferredCategories: [],
    venueNames: [],
    saved: [
      { id: 'a', title: 'Early set', category: 'Music', venueName: 'Enmore Theatre', suburb: 'Newtown', subTags: [] },
      { id: 'b', title: 'Late set', category: 'Music', venueName: 'The Factory', suburb: 'Surry Hills', subTags: [] },
    ],
  })
  const picked = rankDigest([
    ev({ id: 'a', title: 'Early set', time: '18:00', venueName: 'Enmore Theatre', suburb: 'Newtown', latitude: -33.898, longitude: 151.179 }),
    ev({ id: 'b', title: 'Late set', time: '21:00', venueName: 'The Factory', suburb: 'Surry Hills', latitude: -33.884, longitude: 151.21 }),
  ], profile, opts())
  const later = picked.saved.find((e) => e.id === 'b') ?? (picked.hero?.id === 'b' ? picked.hero : null)
  assert.match(later?.travel ?? '', /About \d+ min (walk|drive) from Enmore Theatre/)
})

test('trust line is source and updated, with no verified wording', () => {
  const line = trustLine('ticketmaster', new Date('2026-10-28T02:00:00.000Z'))
  assert.equal(line, 'Ticketmaster · Updated 28 Oct')
  assert.equal(trustLine(null, new Date()), null)
  assert.doesNotMatch(line ?? '', /verified|confidence/i)
})

test('email image urls stay on the canonical host and reject svg or data uris', () => {
  assert.equal(emailImageSrc({ id: 'evt_12345678', imageUrl: 'https://cdn.example/a.webp', imageAsset: null }, 'hero'), 'https://outza-outza.vercel.app/api/nl/img?e=evt_12345678&k=hero')
  assert.equal(emailImageSrc({ id: 'evt_12345678', imageUrl: null, imageAsset: null, category: 'Music' }, 'thumb'), 'https://outza-outza.vercel.app/placeholders/music-square.webp')
  assert.equal(emailImageSrc({ id: 'evt_12345678', imageUrl: null, imageAsset: null, category: 'Music' }, 'hero'), 'https://outza-outza.vercel.app/placeholders/music.webp')
  assert.equal(assertPublicImageUrl('https://cdn.example/a.jpg'), 'https://cdn.example/a.jpg')
  assert.equal(assertPublicImageUrl('data:image/png;base64,aaaa'), null)
  assert.equal(assertPublicImageUrl('https://cdn.example/icon.svg'), null)
  assert.equal(assertPublicImageUrl('http://cdn.example/a.jpg'), null)
  assert.equal(assertPublicImageUrl('https://127.0.0.1/a.jpg'), null)
})
