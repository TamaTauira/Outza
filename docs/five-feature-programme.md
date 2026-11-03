# Engagement programme

Additive tables live in `prisma/sql/20261103_engagement_programme.sql`. Apply that file before reactions, daily-briefing cache, or AI rewrites are read in production. The app keeps working if the tables are missing: reactions hide, briefings are computed without a cache, and playback stays off.

## Flags

| Variable | Default | Effect |
| --- | --- | --- |
| `EVENT_REACTIONS` | on | Hides Hot, Love it, Interested, Excited and Going when set to `0`. Going on the old attend route still updates Attendance. |
| `DAILY_BRIEFING` | on | Hides the city briefing under Hot right now when set to `0`. |
| `DAILY_AUDIO` | on only when speech is configured | Forces playback off when set to `0`. |
| `EVENT_INSIGHT_AI` | off | When `1` and a gateway credential exists, a short rewrite is cached after the first view. The fact list is always shown. |

## Audio

Transcripts are built from stored listings for three city editions: today, tonight, and this weekend. One script is cached per city, edition and day. Signed-in preferences can reorder the on-screen list. They do not create a second recording.

Playback calls the Vercel AI Gateway speech endpoint (`AI_GATEWAY_BASE_URL`, default `https://ai-gateway.vercel.sh/v1/audio/speech`) and stores the mp3 with the existing file bucket.

Set all of these before a recording is offered:

- `AI_GATEWAY_TTS_MODEL` — gateway speech model id, for example `openai/tts-1` or `openai/gpt-4o-mini-tts`
- `AI_GATEWAY_API_KEY`, or `VERCEL_OIDC_TOKEN` on Vercel
- `AWS_BUCKET_NAME` — same bucket the image pipeline already uses
- `AI_GATEWAY_TTS_VOICE` — optional, default `alloy`

If any of those are missing, the written briefing still shows and the audio player does not.

## What is not invented

Hot right now heat uses daily totals from the day the migration is applied. Older lifetime views do not get a fake history. Organiser rates stay blank when views were not counted. Venue analytics do not include another organiser’s campaign spend. Event summaries quote listing fields. A curated intelligence note is shown only when it has a source URL and a check inside six months, the same rule as the intelligence copy.
