# National event source expansion

Measured on 3 November 2026 against https://outza-outza.vercel.app and the Brisbane City Council open-data API. Figures below are from those responses. A blank measurement is left blank rather than shown as zero.

## A. Existing integrations

The refresh cycle already runs these connectors, in this order: Ticketmaster, Frontier Touring, City of Sydney, Humanitix, Moshtix, Oztix, Ticketek, Eventbrite, Popular regulars. Brisbane City Council is now the tenth, on the same cron invocation as Popular regulars.

Ticketek is queued, not live. `fetchTicketekEvents` returns immediately when no licensed Impact catalog or partner feed is configured. It was not in the Brisbane public-board mix below.

Upcoming rows from `GET /api/events/stats` (this count includes merged duplicates and non-scheduled statuses; the public board hides `duplicateOfId`):

| City | Upcoming rows |
| --- | ---: |
| Sydney | 4,915 |
| Melbourne | 3,480 |
| Brisbane | 1,579 |
| Adelaide | 1,163 |
| Perth | 1,096 |
| Gold Coast | 716 |
| Hobart | 566 |
| Canberra | 400 |
| Newcastle | 357 |
| Darwin | 272 |
| All rows, no city filter | 14,544 |

Those ten city totals sum to the unfiltered total of 14,544. The largest categories on that unfiltered response were Music 5,108, Arts & Culture 3,346, and Food & Drink 3,264. `lastRefresh` on the response was 2026-11-03T20:56:41.765Z.

Public Brisbane board only, 3 Nov 2026 through 1 Feb 2027 (`/api/events`, duplicates hidden): 1,064 events.

| Source | Events |
| --- | ---: |
| Oztix | 381 |
| Eventbrite | 292 |
| Ticketmaster | 267 |
| Popular regulars | 52 |
| Frontier Touring | 25 |
| Moshtix | 23 |
| Humanitix | 21 |
| Organiser-submitted | 3 |

City of Sydney and Ticketek contributed 0 of those 1,064 rows. A national source mix was not paged.

What can improve without a new connector: Ticketek still needs its licensed feed; Humanitix, Oztix, Eventbrite, Frontier, and City of Sydney are still marked needs-review or terms-only in `lib/trust-shared.ts`. Those connectors were left running. No second copy of them was added.

## B. New sources discovered

Priority venues were checked for an official site and a licence to reuse the calendar. None of the commercial venues published an open-data feed. Sydney Opera House `robots.txt` disallows `/` and then allows `/whats-on` for crawlers. That is not permission to copy the calendar. ICC Sydney disallows `/feed`. Those sites were not scraped.

| Source | Coverage | Access | Licence | Value |
| --- | --- | --- | --- | --- |
| Brisbane City Council events | Brisbane | OpenDataSoft records API, daily extract, cap 2,000 | CC BY 4.0 | Libraries, parks, classes, community events that the ticket feeds do not carry |
| Sydney Opera House | Bennelong Point | Website only | Permission required | Performing arts not fully covered by Ticketmaster |
| Enmore Theatre | Enmore | Website only | Permission required | Comedy and independent shows |
| Factory Theatre | Marrickville | Website only | Permission required | Same pattern as Enmore |
| ICC Sydney | Darling Harbour | Website only. `/feed` disallowed | Permission required | Exhibitions and conferences. Trade-only rows are not labelled in an open feed |
| TikTok Entertainment Centre | ICC Sydney precinct, about 8,000–9,000 capacity | tiktokentcent.com and the ICC Sydney venue page | Permission required | A separate room, not a former name of the Olympic Park arena |
| Afterpay Arena | 19 Edwin Flack Avenue, Sydney Olympic Park | afterpayarena.com.au. Official rename 23 July 2026 | Permission required | Former names Qudos Bank Arena, Allphones Arena, Acer Arena, Sydney SuperDome |
| Accor Stadium | Sydney Olympic Park | Public site, robots allow `/` | Permission required. Fixtures also belong on Ticketmaster or a licensed Ticketek feed | Former names Stadium Australia, ANZ Stadium, Telstra Stadium |
| Allianz Stadium | Moore Park | Public site | Permission required | Not the SCG |
| Sydney Cricket Ground | Moore Park | sydneycricketground.com.au | Permission required | Not Allianz Stadium |
| CommBank Stadium | Parramatta | Public site | Permission required | Former names Bankwest Stadium, Western Sydney Stadium |
| McDonald Jones Stadium | Newcastle | mcdonaldjonesstadium.com | Permission required | Former names Hunter, EnergyAustralia, Ausgrid |
| WIN Stadium | Wollongong | Host answered 403 to this client | Permission required. Wollongong is outside the current city list | Not WIN Entertainment Centre |
| WIN Entertainment Centre | Wollongong | wec.com.au | Permission required | Separate building from WIN Stadium |
| State Theatre Sydney | Sydney CBD | statetheatre.com.au | Permission required | Not a State Theatre in another city |
| City of Melbourne bookable venues | Melbourne | Open data, CC BY 4.0 | Open data | Rooms for hire, not a calendar |
| City of Melbourne planned works | Melbourne | Open data | Open data | Mixes road works with permit windows. Dates are ranges, not session times |
| Melbourne Conversations | Melbourne | Open data | Open data | Series ended in 2017 |

## C. Integration decisions

| Source | Decision | Reason |
| --- | --- | --- |
| Ticketmaster, Frontier, City of Sydney, Moshtix, Popular regulars | Existing integration kept | Already in the refresh cycle |
| Humanitix, Oztix, Eventbrite | Existing integration kept | Already running. Provider policy still says the licence needs a written check. Not expanded |
| Ticketek | Merged into the queued licensed feed | Stadium calendars were not scraped to bypass the missing Ticketek credentials |
| Brisbane City Council | Integrated | CC BY 4.0 facts only. Photos are not copied. Empty responses alert and do not delete rows |
| Six priority venue groups (Opera House, Enmore, Factory, ICC, the stadiums, State Theatre, both arenas) | Requires permission | No open licence. Canonical aliases are stored so a later licensed feed does not double-list a renamed venue |
| City of Melbourne bookable venues | Rejected | Not events |
| City of Melbourne planned works | Deferred | Would create wrong dates |
| Melbourne Conversations | Rejected | Historical only |

## D. Duplicate audit

Brisbane City Council feed read on 3 Nov 2026 at 22:22 UTC. `total_count` was 2,000 and 2,000 rows parsed. 0 titled rows failed to parse. 1,991 had a venue name. 9 did not. The published cap is 2,000 upcoming rows, so anything past that cap was not in the file. 1,998 of the parsed rows fall on 3 Nov 2026 through 1 Feb 2027. 2 fall outside that window.

Compared with the 1,064 public Brisbane board rows in the same window. Same calendar date only. Different weeks of a repeat stay separate. Booking links for one session are not counted twice.

| Metric | Result |
| --- | ---: |
| Valid source event occurrences | 1,996 |
| Already present in VibePeep (automatic link) | 0 |
| Confirmed new occurrences | 1,981 |
| Additional sessions discovered | 1 (included in the 1,981) |
| Existing records enriched | 0 |
| Uncertain duplicate candidates | 15 |
| Feed rows marked cancelled, postponed, or rescheduled | 2 |
| Unique event contribution | 1,981 / 1,996 = 99.25% |

Check: 0 + 1,981 + 15 = 1,996. The 2 cancelled, postponed, or rescheduled rows are excluded from the valid count.

Automatic links were 0, so this comparison produced no false merge. Precision is not a percentage when the automatic-link set is empty. Recall against the whole feed was not labelled. Twelve of the 15 uncertain pairs were printed. Each is the same title or a longer title at the same library or park (for example Jack Johnson at Riverstage versus “Riverstage, Brisbane City”, and library storytimes whose board title adds the library name). They stayed public and unlinked, which is the intended bias. The other 3 uncertain pairs were not printed.

The checked-in labelled pairs in `lib/event-identity.test.ts` and `lib/venue-identity.test.ts` cover same-id reschedules, separate session ids, weekly repeats, a cancellation, Enmore cross-source matches, Allianz versus the SCG at one address, Opera House rooms, Afterpay versus Qudos versus TikTok Entertainment Centre, and WIN Stadium versus WIN Entertainment Centre. That test run had 0 failures.

Priority venues were not ingested. Counts below are public-board rows from 3 Nov 2026 through 1 Feb 2027 whose `venueName` contains the string. They are not a count of the venue’s own calendar, and a name that contains two strings is counted twice.

Sydney board API total 3,875. Returned rows:

| Venue string | Rows |
| --- | ---: |
| Sydney Opera House | 53 |
| State Theatre | 45 |
| Sydney Cricket Ground | 14 |
| CommBank Stadium | 13 |
| Allianz Stadium | 11 |
| ANZ Stadium | 11 |
| ICC Sydney | 6 |
| Enmore Theatre | 6 |
| Accor Stadium | 4 |
| TikTok Entertainment Centre | 1 |
| Factory Theatre | 0 |
| Afterpay Arena | 0 |
| Qudos Bank Arena | 0 |
| SCG (abbreviation only) | 0 |
| Bankwest Stadium | 0 |
| WIN Stadium | 0 |
| WIN Entertainment Centre | 0 |

Newcastle board API total 278. McDonald Jones Stadium: 11. The other strings above were 0 there.

A search for “WIN Stadium” with no city filter returned 2 events. Both `venueName` values were Accor Stadium, so they are not WIN Stadium listings.

## E. Implementation summary

New modules:

- `lib/venue-identity.ts` — canonical names, former names, and rooms.
- `lib/event-identity.ts` — URL canonicalisation, duplicate decision, catalogue comparison.
- `lib/source-health.ts` — zero-event, volume-drop, parse-failure, duplicate-spike, and venue-gap alerts. `retireOnEmpty` is always false.
- `lib/source-record.ts` — source id and canonical URL stored on the existing `SourceRecord` table.
- `lib/sources/brisbane-council.ts` — open-data adapter. Addresses are copied only from `venueaddress`. Photos are omitted.
- `lib/sources/register.ts` — the source register.

`saveEvent` still uses the dedupe hash, then asks `decideDuplicate` before a fuzzy merge. Same-source rows with different external ids are not merged. Organiser field overrides and `organiserEditedAt` stay in place. A source patch cannot set `promoterId`, `venueId`, claims, or the manage token. Quality pass links only on `action: link` and writes `DUPLICATE_REVIEW` instead of hiding uncertain rows. Venue grants are unchanged; the existing ownership tests still pass.

Schema (additive SQL in `prisma/sql/20261103_source_identity.sql`):

- `SourceRecord.externalId`, `canonicalUrl`, `sessionKey`
- `DataQualityAlert`

Apply that file before the deploy that writes the new columns. Until then, source-key lookup and alert storage no-op on a missing column, and refresh still runs.

Brisbane City Council runs inside the existing `curated` cron (minute 50), with a 100 second budget shared in the sense that each of the two sources may use up to 100 seconds. No new Vercel cron was added, because the hour is already full at a 6 minute gap. Event URLs stay `/events/<slug>-<id>`. Linking a duplicate sets `duplicateOfId` and does not delete the row or change the id.

Tests run: `lib/event-identity.test.ts`, `lib/venue-identity.test.ts`, `lib/source-expansion.test.ts`, `lib/refresh-plan.test.ts`, `lib/event-redirect.test.ts`, `lib/listing-window.test.ts`, `lib/ownership.test.ts`.

Deployment: code is ready to merge. The Brisbane importer will not persist source ids until the SQL file is applied. Photos stay off. The other priority sources stay off.

## F. National coverage opportunities

Brisbane’s public 90-day board is 1,064 events, against 3,875 in Sydney and 278 in Newcastle over the same window. The council feed’s 1,981 new occurrences are almost all libraries, parks, and classes, which the ticket sources do not list. That is the gap this change fills.

Still thin, from the same stats call: Darwin 272 upcoming rows, Newcastle 357, Canberra 400, Hobart 566. Gold Coast is 716. Perth is 1,096 and Adelaide 1,163, both well under Melbourne (3,480) and Sydney (4,887).

Next sources worth a licence, in order:

1. Ticketek’s licensed feed, which would cover the arenas and stadiums already aliased here (Afterpay Arena and Qudos had 0 public rows under those names in the Sydney window).
2. Sydney Opera House, State Theatre, Enmore, and Factory, under a written reuse permission. The board already shows 53 Opera House rows and 45 State Theatre rows in the window; a direct feed is for the sessions those ticket rows miss, not a second copy.
3. A council open-data calendar for Melbourne, Adelaide, Perth, Hobart, Darwin, or Canberra that is actually an event list under an open licence. The Melbourne files checked here were rooms, works permits, or a finished series.
4. Wollongong (WIN Stadium and WIN Entertainment Centre) only after a city decision. It is outside the current city radius.

## Risks

- The council file stops at 2,000 rows. Events past that cap were not measured.
- The first Brisbane run may hit the 100 second budget. A partial save is kept and the next run continues. A timeout is not treated as an empty feed, and an empty feed does not delete rows.
- Fifteen likely duplicates were left as two public rows. That is preferable to a wrong merge. They show up as `DUPLICATE_REVIEW` after the quality pass.
- Saved events on a row that is later marked `duplicateOfId` still point at that row. This matches the existing merge behaviour. Rows are not deleted.
- Image rights for the council feed were not established, so artwork is blank until a later decision.
- Venue alias data does not invent street addresses. Addresses still come from the listing that is ingested.
