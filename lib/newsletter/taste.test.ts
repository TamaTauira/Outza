import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertPublicImageUrl, emailImageSrc } from './images'
import { buildProfile, inDigestScope, rankDigest, trustLine, type DigestEvent, type RankOpts } from './taste'

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
  assert.match(profile.intro, /You've been peeping at arts and theatre/)
  assert.match(profile.intro, /lined up around that/)
  assert.doesNotMatch(profile.intro, /variety sneaks in|wellness/i)
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
  assert.equal(ids.includes('near'), false)
  assert.equal(picked.saved.some((e) => e.id === 'saved-gig'), true)
  assert.match(picked.saved.find((e) => e.id === 'saved-gig')?.whyLine ?? '', /watchlist|Together|itinerary|follow|Near|peep|gig/)
  assert.equal(ids.filter((id) => id === 'like-gig' || id === 'same-name').length <= 1, true)
  const titles = [picked.hero, ...picked.weekend, ...picked.because, ...picked.free].map((e) => e?.title.toLowerCase())
  assert.equal(titles.filter((t) => t?.startsWith('another band')).length <= 1, true)
})

test('a thin profile is not padded with popular events from categories they never chose', () => {
  const profile = buildProfile({ name: 'Jamie', city: 'Sydney', preferredCategories: [], venueNames: [], saved: [] })
  const events = [
    ev({ id: 'quiet', title: 'Quiet one', popularity: 0, hasImage: false, imageUrl: null, date: new Date('2026-11-04T00:00:00.000Z') }),
    ev({ id: 'busy', title: 'Busy one', popularity: 40, category: 'Community', date: new Date('2026-10-31T00:00:00.000Z') }),
    ev({ id: 'also', title: 'Also busy', popularity: 20, category: 'Sports', date: new Date('2026-11-04T00:00:00.000Z') }),
    ev({ id: 'yoga', title: 'Sunset yoga', popularity: 80, category: 'Wellness', isFree: true, priceMin: 0 }),
  ]
  const picked = rankDigest(events, profile, opts())
  assert.equal(picked.thin, true)
  assert.equal(picked.hero, null)
  assert.equal(picked.because.length, 0)
  assert.equal(picked.popular.length, 0)
  assert.equal(picked.weekend.length, 0)
  assert.equal(picked.free.length, 0)
  assert.match(picked.intro, /new on our radar/)
})

test('free-only taste keeps paid events out of the hero and shows a free section', () => {
  const profile = buildProfile({
    name: 'Sam',
    city: 'Sydney',
    preferredCategories: ['Community'],
    venueNames: [],
    vibe: { spend: ['Free is my favourite price'] },
    saved: [{ id: 's', title: 'Market', category: 'Community', venueName: 'Square', suburb: 'Glebe', subTags: [] }],
  })
  const events = [
    ev({ id: 'paid', title: 'Pricey dinner', category: 'Food & Drink', priceMin: 120, popularity: 30 }),
    ev({ id: 'free', title: 'Twilight market', category: 'Community', isFree: true, priceMin: 0, popularity: 8, suburb: 'Glebe' }),
    ev({ id: 'lawn', title: 'Park screening', category: 'Film', isFree: true, priceMin: 0, popularity: 80, suburb: 'Redfern', date: new Date('2026-11-04T00:00:00.000Z') }),
    ev({ id: 'stalls', title: 'Craft stalls', category: 'Community', isFree: true, priceMin: 0, popularity: 2, suburb: 'Glebe', date: new Date('2026-11-03T00:00:00.000Z') }),
    ev({ id: 'choir', title: 'Park choir', category: 'Community', isFree: true, priceMin: 0, popularity: 2, suburb: 'Glebe', date: new Date('2026-11-03T00:00:00.000Z'), venueName: 'Glebe Town Hall' }),
    ev({ id: 'picnic', title: 'Community picnic', category: 'Community', isFree: true, priceMin: 0, popularity: 2, suburb: 'Glebe', date: new Date('2026-11-04T00:00:00.000Z'), venueName: 'Glebe Point' }),
    ev({ id: 'talk', title: 'Neighbourhood talk', category: 'Community', isFree: true, priceMin: 0, popularity: 1, suburb: 'Glebe', date: new Date('2026-11-04T00:00:00.000Z'), venueName: 'Library' }),
  ]
  const picked = rankDigest(events, profile, opts())
  const ids = [picked.hero, ...picked.weekend, ...picked.because, ...picked.saved, ...picked.free, ...picked.popular].filter(Boolean).map((e) => e!.id)
  assert.equal(picked.hero?.isFree, true)
  assert.equal(ids.includes('paid'), false)
  assert.equal(ids.includes('lawn'), false)
  assert.ok(picked.free.length >= 1)
  assert.ok([picked.hero, ...picked.free].every((e) => e?.isFree && e.category === 'Community'))
  assert.match([picked.hero, ...picked.free].map((e) => e?.whyLine).join(' '), /community events you saved|Because you follow Community/)
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

function placed(picked: ReturnType<typeof rankDigest>) {
  return [picked.hero, ...picked.weekend, ...picked.because, ...picked.saved, ...picked.free, ...picked.popular].filter((e) => !!e)
}

test('music and comedy preferences never include wellness', () => {
  const profile = buildProfile({
    name: 'Alex Owner',
    city: 'Sydney',
    preferredCategories: ['Music', 'Comedy'],
    venueNames: [],
    vibe: { vibes: ['Wellness', 'Outdoorsy'], spend: ['Under $30'] },
    viewed: [{ id: 'viewed-well', title: 'Sound bath', category: 'Wellness', venueName: 'Studio', suburb: 'Bondi', subTags: ['Yoga'] }],
    clickedCategories: ['Wellness'],
    saved: [{ id: 'saved-gig', title: 'Old favourite', category: 'Music', venueName: 'The Factory', suburb: 'Surry Hills', subTags: [] }],
  })
  const yoga = ev({ id: 'yoga', title: 'Sunset yoga', category: 'Wellness', isFree: true, priceMin: 0, popularity: 100, suburb: 'Bondi' })
  const bath = ev({ id: 'bath', title: 'Sound bath', category: 'Wellness', isFree: true, priceMin: 0, popularity: 90, date: new Date('2026-10-31T00:00:00.000Z') })
  const market = ev({ id: 'market', title: 'Craft market', category: 'Community', isFree: true, priceMin: 0, popularity: 40 })
  const play = ev({ id: 'play', title: 'A serious play', category: 'Arts & Culture', subTags: ['Theatre'], popularity: 30 })
  const gig = ev({ id: 'gig', title: 'Friday riffs', category: 'Music', popularity: 5, date: new Date('2026-10-30T00:00:00.000Z') })
  const laughs = ev({ id: 'laughs', title: 'Stand-up night', category: 'Arts & Culture', subTags: ['Comedy'], popularity: 4, date: new Date('2026-10-31T00:00:00.000Z') })
  const cheapGig = ev({ id: 'cheap-gig', title: 'Park band', category: 'Music', isFree: true, priceMin: 0, popularity: 3, date: new Date('2026-11-02T00:00:00.000Z') })
  const cheapTwo = ev({ id: 'cheap-two', title: 'Lunchtime jazz', category: 'Music', isFree: true, priceMin: 0, popularity: 2, date: new Date('2026-11-03T00:00:00.000Z'), venueName: 'Town Hall' })
  const cheapThree = ev({ id: 'cheap-three', title: 'Courtyard set', category: 'Music', isFree: true, priceMin: 0, popularity: 2, date: new Date('2026-11-03T00:00:00.000Z'), venueName: 'The Bearded Tit' })
  const cheapFour = ev({ id: 'cheap-four', title: 'Acoustic hour', category: 'Music', isFree: true, priceMin: 0, popularity: 1, date: new Date('2026-11-04T00:00:00.000Z'), venueName: 'Camelot Lounge' })
  assert.equal(inDigestScope(yoga, profile), false)
  assert.equal(inDigestScope(play, profile), false)
  assert.equal(inDigestScope(gig, profile), true)
  assert.equal(inDigestScope(laughs, profile), true)
  const picked = rankDigest([yoga, bath, market, play, gig, laughs, cheapGig, cheapTwo, cheapThree, cheapFour], profile, opts())
  const all = placed(picked)
  assert.ok(all.some((e) => e.id === 'gig' || e.id === 'laughs'))
  assert.equal(all.some((e) => e.category === 'Wellness'), false)
  assert.equal(all.some((e) => e.id === 'market' || e.id === 'play'), false)
  assert.ok(picked.free.length >= 1)
  assert.ok(picked.free.every((e) => e.category === 'Music' || /comedy|stand-?up/i.test(`${e.category} ${e.title} ${e.subTags.join(' ')}`)))
  for (const e of all) {
    assert.doesNotMatch(e.whyLine, /wellness/i)
    assert.match(e.whyLine, /Music|comedy|watchlist|gig|follow|peep|Free|Surry Hills|itinerary|Together/i)
  }
  assert.equal(all.length < 7, true)
})

test('a short match list stays short instead of padding other categories', () => {
  const profile = buildProfile({
    name: 'Sam',
    city: 'Sydney',
    preferredCategories: ['Music'],
    venueNames: [],
    saved: [],
    viewed: [{ id: 'v', title: 'Yoga flow', category: 'Wellness', venueName: 'Studio', suburb: 'Bondi', subTags: [] }],
  })
  const picked = rankDigest([
    ev({ id: 'only', title: 'One gig', category: 'Music' }),
    ev({ id: 'yoga', title: 'Sunset yoga', category: 'Wellness', popularity: 50, isFree: true, priceMin: 0 }),
    ev({ id: 'run', title: 'Harbour run', category: 'Sports', popularity: 40 }),
    ev({ id: 'fair', title: 'Street fair', category: 'Community', popularity: 30, isFree: true, priceMin: 0 }),
  ], profile, opts())
  const all = placed(picked)
  assert.deepEqual(all.map((e) => e.id), ['only'])
  assert.equal(all[0]?.whyLine, 'Because you follow Music')
})

test('a saved event outside your categories still shows, and does not open that category', () => {
  const profile = buildProfile({
    name: 'Sam',
    city: 'Sydney',
    preferredCategories: ['Music'],
    venueNames: [],
    saved: [{ id: 'yoga-saved', title: 'Sunrise yoga', category: 'Wellness', venueName: 'The Lawn', suburb: 'Bondi', subTags: ['Yoga'] }],
  })
  const picked = rankDigest([
    ev({ id: 'yoga-saved', title: 'Sunrise yoga', category: 'Wellness', isFree: true, priceMin: 0 }),
    ev({ id: 'other-yoga', title: 'Sunset yoga', category: 'Wellness', popularity: 20, isFree: true, priceMin: 0 }),
    ev({ id: 'gig', title: 'Friday riffs', category: 'Music' }),
  ], profile, opts())
  const all = placed(picked)
  assert.equal(all.some((e) => e.id === 'other-yoga'), false)
  assert.equal(all.some((e) => e.id === 'gig'), true)
  const savedYoga = all.find((e) => e.id === 'yoga-saved')
  assert.ok(savedYoga)
  assert.match(savedYoga?.whyLine ?? '', /watchlist/)
})

test('a followed venue can include that venue outside your categories', () => {
  const profile = buildProfile({
    name: 'Sam',
    city: 'Sydney',
    preferredCategories: ['Music'],
    venueNames: ['The Yoga Room'],
    saved: [],
  })
  const picked = rankDigest([
    ev({ id: 'room', title: 'Morning stretch', category: 'Wellness', venueName: 'The Yoga Room', suburb: 'Newtown' }),
    ev({ id: 'other', title: 'Beach yoga', category: 'Wellness', venueName: 'Bondi Pavilion', popularity: 30 }),
    ev({ id: 'gig', title: 'Friday riffs', category: 'Music' }),
  ], profile, opts())
  const all = placed(picked)
  const room = all.find((e) => e.id === 'room')
  assert.ok(room)
  assert.equal(room?.whyLine, 'Because you follow The Yoga Room')
  assert.equal(all.some((e) => e.id === 'other'), false)
  assert.equal(all.some((e) => e.id === 'gig'), true)
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
