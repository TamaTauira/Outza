import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { NlEvent } from './rank'
import { renderHtml, renderText, type RenderInput, type Slot } from './render'
import { runQa } from './qa'

function ev(over: Partial<NlEvent> & { id: string; title: string }): NlEvent {
  return {
    description: 'A night out.',
    date: new Date('2026-10-30T00:00:00.000Z'),
    endDate: null,
    time: '19:30',
    endTime: null,
    venueName: 'The Imperial',
    venueAddress: '1 King St',
    suburb: 'Newtown',
    city: 'Sydney',
    category: 'Music',
    subTags: [],
    isFree: false,
    isLGBTI: false,
    price: '$28',
    priceMin: 28,
    priceMax: 28,
    feesIncluded: false,
    imageUrl: 'https://cdn.example/gig.jpg',
    ticketUrl: 'https://tickets.example/gig',
    source: 'ticketmaster',
    sources: ['ticketmaster'],
    status: 'SCHEDULED',
    statusSource: null,
    lastVerifiedAt: new Date('2026-10-28T00:00:00.000Z'),
    updatedAt: new Date('2026-10-28T00:00:00.000Z'),
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    latitude: -33.898,
    longitude: 151.179,
    ageRestriction: null,
    recurrence: null,
    duplicateOfId: null,
    views: 3,
    ticketClicks: 1,
    imageAsset: null,
    _count: { savedBy: 2, attendees: 1 },
    score: 20,
    why: ['interest'],
    whyLine: 'Because you follow Music',
    travel: null,
    hasImage: true,
    popularity: 4,
    ...over,
  } as NlEvent
}

function slot(event: NlEvent, img: string | null): Slot {
  return { ev: event, img, blurb: `${event.category} at ${event.venueName}.` }
}

function input(): RenderInput {
  const hero = ev({ id: 'hero1', title: 'Big Friday gig', whyLine: 'Because you follow Music' })
  const weekend = ev({ id: 'week1', title: 'Saturday market', category: 'Community', suburb: 'Surry Hills', venueName: 'Crown Street', whyLine: 'Near Surry Hills', isFree: true, priceMin: 0, price: 'Free' })
  const saved = ev({ id: 'save1', title: 'The gig you kept', whyLine: 'On your watchlist', travel: 'About 18 min walk from The Imperial', date: new Date('2026-10-31T00:00:00.000Z') })
  const cheap = ev({ id: 'free1', title: 'Cheap laughs', category: 'Arts & Culture', whyLine: 'Because you follow comedy', isFree: true, priceMin: 0, price: 'Free', imageUrl: null, hasImage: false })
  return {
    ctx: { sendId: 'preview', edition: 'weekly', issueDate: '2026-10-29', city: 'Sydney' },
    userId: 'user1',
    email: 'sam@example.com',
    editionKey: 'weekly',
    city: 'Sydney',
    from: new Date('2026-10-29T00:00:00.000Z'),
    to: new Date('2026-11-05T00:00:00.000Z'),
    greeting: 'Hey Sam,',
    intro: "You've been peeping at comedy and Newtown bars, so this one's lined up around that.",
    preview: "Hey Sam — You've been peeping at comedy and Newtown bars, so this one's lined up around that.",
    subject: 'Sam, Newtown is doing the most',
    cta: 'A',
    nearTitle: 'This weekend near you',
    becauseTitle: 'Because you liked comedy',
    reminderOptIn: true,
    hero: slot(hero, 'https://outza-outza.vercel.app/api/nl/img?e=hero1&k=hero'),
    weekend: [slot(weekend, 'https://outza-outza.vercel.app/api/nl/img?e=week1&k=thumb')],
    because: [],
    saved: [slot(saved, 'https://outza-outza.vercel.app/api/nl/img?e=save1&k=thumb')],
    free: [slot(cheap, null)],
    popular: [],
    sponsored: [],
    sponsoredPos: 'end',
    trackOpens: false,
  }
}

test('the digest html is personal, table-based, and Gmail-safe', () => {
  const html = renderHtml(input())
  const text = renderText(input())
  assert.match(html, /Hey Sam,/)
  assert.match(html, /peeping at comedy and Newtown bars/)
  assert.match(html, /YOUR TOP PICK/)
  assert.match(html, /Because you follow Music/)
  assert.match(html, /This weekend near you/)
  assert.match(html, /Near Surry Hills/)
  assert.match(html, /Saved events coming up/)
  assert.match(html, /Reminder: you asked for a nudge/)
  assert.match(html, /About 18 min walk from The Imperial/)
  assert.match(html, /Free or cheap/)
  assert.match(html, /Because you follow comedy/)
  assert.match(html, /Why you're seeing this/)
  assert.match(html, /Ticketmaster · Updated 28 Oct/)
  assert.match(html, /Manage preferences/)
  assert.match(html, /Unsubscribe/)
  assert.match(html, /vibepeep-wordmark-ondark\.png/)
  assert.match(html, /vibepeep-mascot-email\.png/)
  assert.match(html, /alt="VibePeep mascot"/)
  assert.match(html, /Cheap laughs/)
  assert.match(html, /Arts &amp; Culture/)
  assert.match(html, /background-size:cover/)
  assert.match(html, /prefers-color-scheme:\s*dark/)
  assert.match(html, /color-scheme" content="light dark"/)
  assert.match(html, /class="heroimg"[^>]*width="552" height="311"/)
  assert.equal(html.includes('data:image'), false)
  assert.equal(/\.svg(\?|")/.test(html), false)
  assert.equal(/\bVerified\b/.test(html), false)
  assert.equal(/confidence/i.test(html), false)
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
  assert.ok(imgs.length >= 4)
  assert.equal(imgs.filter((tag) => tag.includes('vibepeep-mascot')).length, 1)
  const thumbs = [...html.matchAll(/class="thumbimg"[^>]*width="(\d+)" height="(\d+)"/g)]
  assert.equal(thumbs.length, 2)
  for (const thumb of thumbs) assert.equal(`${thumb[1]}x${thumb[2]}`, '104x104')
  assert.doesNotMatch(html, /\.thumbimg\{[^}]*height:\s*auto/)
  for (const tag of imgs) {
    const src = /src="([^"]+)"/.exec(tag)?.[1] ?? ''
    assert.match(src, /^https:\/\/outza-outza\.vercel\.app\//)
    assert.match(tag, /\bwidth="\d+"/)
    assert.match(tag, /\bheight="\d+"/)
    assert.match(tag, /\balt="/)
  }
  assert.match(html, /<table/)
  assert.match(html, /max-width:620px/)
  assert.match(text, /Hey Sam,/)
  assert.match(text, /Unsubscribe:/)
  assert.match(text, /About 18 min walk/)
  assert.match(text, /Why you're seeing this: Because you follow Music/)
  assert.match(text, /FREE OR CHEAP/)
  const qa = runQa({
    html, text, subject: 'Sam, Newtown is doing the most', preview: input().preview,
    sections: [], sponsored: false,
    from: input().from, to: input().to, optedIn: true, realSend: false,
  })
  assert.deepEqual(qa.errors, [])
})
