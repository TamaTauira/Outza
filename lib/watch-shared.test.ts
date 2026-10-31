import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emailLockup } from './email-brand'
import { composeWatchEmail, emailWhen, followedCities, prepareWatchLists, stillAhead, type WatchRow } from './watch-shared'

/** 11:15am NZDT on Sunday 1 Nov 2026. Sydney is already Sunday morning. */
const SENT = new Date('2026-10-31T22:15:00.000Z')

function row(over: Partial<WatchRow> & { id: string; title: string; date: string; city: string }): WatchRow {
  return {
    venueName: 'The Imperial',
    time: '19:00',
    endTime: '22:00',
    category: 'Nightlife',
    status: 'SCHEDULED',
    duplicateOfId: null,
    seriesKey: null,
    ...over,
  }
}

test('the lockup is one mascot and one wordmark, both PNG on the production host', () => {
  const html = emailLockup({ dark: true })
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
  assert.equal(imgs.length, 2)
  assert.equal(imgs.filter((tag) => tag.includes('vibepeep-mascot-email.png')).length, 1)
  assert.equal(imgs.filter((tag) => tag.includes('vibepeep-wordmark-ondark.png')).length, 1)
  assert.equal(html.includes('icon-192'), false)
  assert.equal(html.includes('.svg'), false)
  assert.equal(html.includes('.webp'), false)
  assert.match(html, /Take a peep at what(?:'|&#39;)s happening\./)
  for (const tag of imgs) {
    const src = /src="([^"]+)"/.exec(tag)?.[1] ?? ''
    assert.match(src, /^https:\/\/outza-outza\.vercel\.app\//)
    assert.match(src, /\.png$/)
    assert.match(tag, /\bwidth="\d+"/)
    assert.match(tag, /\bheight="\d+"/)
    assert.match(tag, /\balt="[^"]+"/)
  }
})

test('a Saturday noon start reads the way the board does', () => {
  const when = emailWhen(row({ id: 'boat', title: 'Harbour Hoopla', date: '2026-11-07T00:00:00.000Z', time: '12:00', endTime: '16:00', city: 'Sydney', category: 'Community' }))
  assert.equal(when, 'Sat 7 Nov · 12:00 pm – 4:00 pm')
  const startOnly = emailWhen(row({ id: 'gig', title: 'Late show', date: '2026-11-07T00:00:00.000Z', time: '19:30', endTime: null, city: 'Sydney' }))
  assert.equal(startOnly, 'Sat 7 Nov · 7:30 pm')
})

test('the digest sent Sunday morning drops ended events and other cities', () => {
  const cities = followedCities(['Sydney'], 'Sydney')
  assert.deepEqual(cities, ['Sydney'])
  const saved = [
    row({ id: 'boat', title: 'Harbour Hoopla Boat Party 2026!', date: '2026-11-07T00:00:00.000Z', time: '12:00', endTime: '16:00', city: 'Sydney', venueName: 'Pirrama Park (Near Tied to Tide sculpture)', category: 'Community' }),
    row({ id: 'old-save', title: 'Already been', date: '2026-10-31T00:00:00.000Z', time: '18:00', endTime: '21:00', city: 'Sydney' }),
  ]
  const matches = [
    row({ id: 'bne', title: 'SCARY HOURS', date: '2026-10-31T00:00:00.000Z', time: '19:00', city: 'Brisbane', venueName: 'Summa House' }),
    row({ id: 'hba', title: 'Halloweek', date: '2026-10-31T00:00:00.000Z', time: '21:00', city: 'Hobart', venueName: 'Twisted Lime' }),
    row({ id: 'syd-ended', title: 'LIV Halloween', date: '2026-10-31T00:00:00.000Z', time: '22:30', endTime: '02:00', city: 'Sydney', venueName: 'ivy Sydney' }),
    row({ id: 'mel', title: 'Melbourne gig', date: '2026-11-08T00:00:00.000Z', time: '20:00', city: 'Melbourne', category: 'Nightlife' }),
    row({ id: 'music', title: 'Jazz somewhere', date: '2026-11-06T00:00:00.000Z', time: '19:00', city: 'Sydney', category: 'Music' }),
    row({ id: 'next', title: 'Friday at the Imperial', date: '2026-11-06T00:00:00.000Z', time: '21:00', city: 'Sydney', seriesKey: 'imperial-fridays' }),
    row({ id: 'later', title: 'Friday at the Imperial', date: '2026-11-13T00:00:00.000Z', time: '21:00', city: 'Sydney', seriesKey: 'imperial-fridays' }),
    row({ id: 'venue-hit', title: 'Market day', date: '2026-11-08T00:00:00.000Z', time: '10:00', endTime: '14:00', city: 'Sydney', category: 'Community', venueName: 'Carriageworks' }),
  ]
  assert.equal(stillAhead(matches[2], SENT), false)
  const picked = prepareWatchLists({
    saved,
    matches,
    cities,
    interests: ['Nightlife'],
    venues: [{ venueName: 'Carriageworks', city: 'Sydney' }],
    now: SENT,
  })
  assert.deepEqual(picked.saved.map((ev) => ev.id), ['boat'])
  assert.deepEqual(picked.matches.map((ev) => ev.id), ['next', 'venue-hit'])
  assert.equal(picked.matches.some((ev) => ev.city !== 'Sydney'), false)
})

test('an empty digest is not sent, and an empty section is left out', () => {
  assert.equal(composeWatchEmail({ saved: [], matches: [] }), null)
  const mail = composeWatchEmail({
    saved: [{ id: '1', title: 'Jazz', when: 'Mon 2 Nov · 7:30 pm', venue: 'Enmore Theatre, Sydney', href: 'https://outza-outza.vercel.app/events/jazz-1', price: 'Free', priceKind: 'free', category: 'Music' }],
    matches: [],
    reminders: true,
    manageHref: 'https://outza-outza.vercel.app/account',
    unsubscribeHref: 'https://outza-outza.vercel.app/unsubscribe?u=1',
    homeHref: 'https://outza-outza.vercel.app',
  })
  assert.ok(mail)
  assert.match(mail.subject, /coming up/)
  assert.match(mail.text, /Jazz/)
  assert.match(mail.text, /Unsubscribe:/)
  assert.equal(mail.html.includes('New listings that match what you follow'), false)
  assert.match(mail.html, /Coming up from your keepers/)
  assert.match(mail.html, /View event/)
  assert.match(mail.html, /Free/)
  assert.match(mail.html, /Take a peep at what(?:'|&#39;)s happening\./)
  assert.match(mail.html, /Manage preferences/)
  assert.match(mail.html, /prefers-color-scheme:\s*dark/)
  assert.match(mail.html, /max-width:600px/)
  assert.equal(/\bverified\b/i.test(mail.html), false)
  assert.equal(mail.html.includes('.svg'), false)
  assert.equal(mail.html.includes('.webp'), false)
  const imgs = [...mail.html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
  assert.equal(imgs.filter((tag) => tag.includes('vibepeep-mascot')).length, 1)
  assert.equal(imgs.filter((tag) => tag.includes('icon-192')).length, 0)
  for (const tag of imgs) {
    assert.match(/src="([^"]+)"/.exec(tag)?.[1] ?? '', /^https:\/\/outza-outza\.vercel\.app\//)
    assert.match(tag, /\bwidth="\d+"/)
    assert.match(tag, /\bheight="\d+"/)
    assert.match(tag, /\balt="/)
  }
})

test('a claimed venue uses the tick image and not the word verified', () => {
  const mail = composeWatchEmail({
    saved: [{
      id: 'boat',
      title: 'Harbour Hoopla Boat Party 2026!',
      when: 'Sat 7 Nov · 12:00 pm',
      venue: 'Pirrama Park (Near Tied to Tide sculpture), Sydney',
      href: 'https://outza-outza.vercel.app/events/harbour-hoopla-boat',
      image: 'https://outza-outza.vercel.app/og-image.png',
      claimed: 'venue',
      category: 'Community',
    }],
    matches: [],
    homeHref: 'https://outza-outza.vercel.app',
  })
  assert.ok(mail)
  assert.match(mail.html, /email-claimed-tick\.png/)
  assert.match(mail.html, /alt="Claimed by the venue"/)
  assert.match(mail.html, /Saved and still ahead/)
  assert.equal(/\bverified\b/i.test(`${mail.html}\n${mail.text}`), false)
  assert.match(mail.text, /Claimed by the venue/)
})
