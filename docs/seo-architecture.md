# SEO architecture

VibePeep’s public guides are server-rendered HTML (ISR, revalidated about every five minutes). Search engines do not need JavaScript to read listings, FAQs or event structured data.

Canonical host for now: `https://outza-outza.vercel.app`.

## What was already in place

- Canonical host, `metadataBase`, robots allow/disallow and `X-Robots-Tag` on private areas.
- Split sitemap: `/sitemap.xml` points at `/sitemaps/guides.xml` and paginated `/sitemaps/events/:page.xml`. Only upcoming, non-duplicate, non-cancelled events are listed.
- City, suburb, topic and date-intent guides (`/sydney/tonight`, `/sydney/newtown/markets/sunday`, and the rest) with unique copy, FAQPage JSON-LD and internal links.
- Empty combinations 404. Thin and stale combinations render `noindex,follow` and stay out of the sitemap. Near-duplicates 308 to the broader guide.
- Event JSON-LD already includes `offers` (when a price or free flag was published), `location`, `eventStatus`, `eventAttendanceMode`, `organizer` and `image`.
- Event pages 308 a mismatched slug onto `/events/<slug>-<id>` once the listing resolves. Admin `/admin/seo` already counts event-page referrals.

## What this change adds

- `lib/indexability.ts` is the shared gate. Call `assessIndexability` instead of copying the numbers.
- Seasonal city pages: `/<city>/christmas`, `/new-years-eve`, `/easter`, `/summer`, `/school-holidays`. The date in the title is the remaining window at render time. Empty seasons 404. Thin or near-duplicate seasons are `noindex` and omitted from the sitemap. Suburb × season URLs are not generated.
- Editorial explainers on the free, markets and family city guides, plus national hubs at `/guides/free-things-to-do`, `/guides/markets` and `/guides/family-activities`. A national hub is indexed only when the listings are spread across more than one city.
- Bare `/events/<id>` URLs (no title slug) 301 to the canonical slug URL. Lookup failures still fall through to the event page.
- Guide conversions on `/admin/seo`: views, event opens, saves and organiser leads, tagged with the landing path and referrer type. Search-referred event opens divided by search-referred guide views is the engaged-search rate. Brand versus non-brand queries are not available until Search Console is connected.

## Indexability threshold

| Check | Rule |
| --- | --- |
| Quantity | At least 5 live listings (`INDEX_MIN_LISTINGS`). |
| Freshness | Undated suburb × activity pages also need 2 listings in the next 28 days. |
| Distinct content | A narrower page that contains at least 85% of a broader guide is a near-duplicate. 6 of 7 listings fails. 5 of 6 still passes. |

Seasonal pages use quantity plus distinct content against the whole city inventory. They do not use the 28-day freshness rule, because the season window is the date filter. School holidays are the shared summer break (15 December–31 January), not each state’s other term dates.

`MIN_INDEX` in `lib/seo.ts` is the same quantity number, re-exported so older imports keep working.

## Analytics

- Opening a guide sends one view to `POST /api/landing/hit` and stores the inbound referrer for two hours (`vp_src`, `vp_lp`).
- Event cards on guides link to `/events/<slug>-<id>?lp=<guide>`. The event page records an open against that guide.
- A new save, a new organiser claim, and a click on the organiser’s own listing count as save or lead for the remembered guide.
- Bots and prefetches are ignored. Counters are aggregates, not unique people. The table is `LandingStat`.

Apply `prisma/sql/20261030_landing_stat.sql` before expecting admin numbers. The page still loads if the table is missing; the counters stay at zero.

## Rollback

1. Revert this pull request. Older guides, the sitemap index and event JSON-LD keep working.
2. Leave `LandingStat` in place. Nothing else reads it. To drop it later: `DROP TABLE IF EXISTS "LandingStat";`
3. Bare event ids then fall through to the event page again (308 when the listing resolves, 404 when it does not).
4. Seasonal and `/guides/...` URLs disappear with the revert. They are not linked from email or the board.

Do not reset the database. Do not delete events.
