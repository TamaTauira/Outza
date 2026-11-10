# Product metrics

`ProductMetric` is the shared first-party counter for organiser analytics and the admin metrics dashboard. It stores a daily total. It does not store a user id, IP address, email, or exact location.

Apply `prisma/sql/20261110_product_metrics.sql` before reading the table. If the table is missing, writers log nothing to the visitor and the older counters keep working.

## Row

| Field | Meaning |
| --- | --- |
| `day` | `YYYY-MM-DD` in Australia/Sydney |
| `name` | What happened. See the list below. |
| `subjectId` | Event id, campaign id, or empty |
| `subjectKind` | `event`, `campaign`, `venue`, `link`, or `catalog` |
| `dim` | A short breakdown: surface, reaction, hour, place, search term, or share code |
| `count` | How many times that bucket happened that day |

Write through `recordProductMetrics` in `lib/product-metrics.ts`. Do not add a second event table for the same signals.

## Names

| name | dim | subject |
| --- | --- | --- |
| `seen` | `board`, `hot`, `search`, `map`, `local`, `spotlight` | event |
| `open` | empty | event |
| `hour` | `0`–`23` Sydney hour of an open | event |
| `place` | `city:Sydney` or `area:Inner West` | event |
| `search` | normalised search term | event |
| `save`, `ticket`, `info`, `share`, `calendar`, `plan`, `itinerary`, `going` | empty | event |
| `reaction` | `HOT`, `LOVE`, `INTERESTED`, `EXCITED` | event |
| `follow_category` | category name | `catalog` |
| `follow_venue` | venue key | `catalog` |
| `spotlight_impression` | surface | campaign |
| `spotlight_click` | `detail` or `ticket` | campaign |
| `share_visit` | share-link code | event |

Organiser charts still read `EngagementDay` for opens, saves, reactions, shares and Get tickets, and `Impression` / `ConversionEvent` for Spotlight history. Those tables already hold the backfill. `ProductMetric` is the stream from this launch onward for the signals that did not exist before, plus a copy of Spotlight and opens so an admin dashboard can query one table.

City and suburb figures are shown only when the bucket has at least 10. Search terms under 5 are hidden. Under-18s and QA accounts are left out of place and audience snapshots.
