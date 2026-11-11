# Engagement programme

Additive tables live in `prisma/sql/20261103_engagement_programme.sql`. Apply that file before reactions are read in production. The app keeps working if the tables are missing: reactions hide. The `DailyBriefing` and `EventInsight` tables remain in that file and in the Prisma schema. The app no longer reads or writes them.

## Flags

| Variable | Default | Effect |
| --- | --- | --- |
| `EVENT_REACTIONS` | on | Hides Hot, Love it, Interested, Excited and Going when set to `0`. Going on the old attend route still updates Attendance. |

## What is not invented

Hot right now heat uses daily totals from the day the migration is applied. Older lifetime views do not get a fake history. Organiser rates stay blank when views were not counted. Venue analytics do not include another organiser’s campaign spend. A curated intelligence note is used only when it has a source URL and a check inside six months.
