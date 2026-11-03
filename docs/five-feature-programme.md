# Engagement programme

Additive tables live in `prisma/sql/20261103_engagement_programme.sql`. Apply that file before reactions or AI rewrites are read in production. The app keeps working if the tables are missing: reactions hide, and listing summaries stay on the stored facts. The `DailyBriefing` table remains in that file and in the Prisma schema. The app no longer reads or writes it.

## Flags

| Variable | Default | Effect |
| --- | --- | --- |
| `EVENT_REACTIONS` | on | Hides Hot, Love it, Interested, Excited and Going when set to `0`. Going on the old attend route still updates Attendance. |
| `EVENT_INSIGHT_AI` | off | When `1` and a gateway credential exists, a short rewrite is cached after the first view. The fact list is always shown. |

## What is not invented

Hot right now heat uses daily totals from the day the migration is applied. Older lifetime views do not get a fake history. Organiser rates stay blank when views were not counted. Venue analytics do not include another organiser’s campaign spend. Event summaries quote listing fields. A curated intelligence note is shown only when it has a source URL and a check inside six months, the same rule as the intelligence copy.
