# Operations

Hands-off trust decisions for VibePeep. Bots may approve or dismiss items above the confidence thresholds. Every decision is stored and can be undone for 30 days. Nothing is deleted.

Times below are Australia/Sydney (AEDT in November).

## What runs

- The daily quality cron also runs the auto-resolver, after the quality pass, inside the function time limit. It only touches rows created after the first run records `live-since`. The backlog that was already waiting stays untouched.
- Monday 9:00 am AEDT (`0 22 * * 0` UTC) sends one approvals email to the owner, and only when something is waiting. Each Approve and Decline link expires in 14 days and works once.
- `/admin/ops` lists the latest 50 decisions, with Undo, and the rule switches. Rules default to on.

Protests and rallies stay hidden. A cooking or product demonstration is not treated as a rally. Contact form mail is unchanged and still goes to the owner's Gmail.

## Health

- `GET /api/ops/summary` with `Authorization: Bearer $OPS_READ_TOKEN` returns queue counts, held listings, recent decisions, contact messages by status (empty until that table exists), last source runs, fault keys, newsletter sends, unclicked search keys, and the Ask error rate. There is no write method on this path.
- A source that fails three times in a row pauses. It is tried again every 6 hours and resumes on a clean run. Listings from a paused source stay up until the usual stale rules hide them. A fault email is sent only after the pause is older than 24 hours.
- Each cron writes a heartbeat. The hourly owner-alerts job raises a fault when a heartbeat is older than twice that cron's schedule.
- Minute 26 of every hour checks the home page, `/sydney`, one event page, Ask, the sitemap, and the share image.
- Dependabot opens updates weekly (Monday 9:00 am AEDT). Patch and minor updates merge when checks pass. Major updates are listed on the Monday approvals email when `GITHUB_TOKEN` is set.
- The monthly ideas email should append `monthlyOpsSection()` from `lib/ops/hooks.ts`. This run does not change that email's schedule.

## Environment

Set these on the Vercel project. This repository does not create database roles.

| Name | Where | Value |
|---|---|---|
| `OPS_DIGEST_SECRET` | Production (and Preview if you send test mail) | A random string of at least 16 characters. Signs the Monday links. If it is unset, `CRON_SECRET` is used. |
| `OPS_READ_TOKEN` | Production | A different random string, at least 16 characters. Bots send it as `Authorization: Bearer …` to `GET /api/ops/summary`. |
| `DATABASE_URL_READONLY` | Production | Connection string for a Postgres role that has `SELECT` only. The summary uses it when set, and falls back to `DATABASE_URL` until then. The JSON field `databaseRole` says which one answered. |
| `OPS_RESOLVE_BACKLOG` | Do not set | Leave unset. Setting it to `1` lets the live resolver change rows that existed before `live-since`. That is a production data change and needs a Neon snapshot plus a yes in chat first. |
| `GITHUB_TOKEN` or `GH_TOKEN` | Optional | When set, the Monday email lists open Dependabot major updates. |
| `AI_GATEWAY_SPEND_USD` | Optional | Copied into the monthly operations section. If unset, the section says to check the AI Gateway dashboard. |
| `NEON_STORAGE_BYTES` | Optional | Copied into the monthly operations section. If unset, the section says to check the Neon console. |

`CRON_SECRET` is already required for the crons.

### Read-only database role

Run this in the Neon SQL editor yourself. The app does not run it. Replace the password and the database name (the name in `DATABASE_URL`, often `neondb`).

```sql
CREATE ROLE vibepeep_ops_read WITH LOGIN PASSWORD 'choose-a-long-password';
GRANT CONNECT ON DATABASE neondb TO vibepeep_ops_read;
GRANT USAGE ON SCHEMA public TO vibepeep_ops_read;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO vibepeep_ops_read;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO vibepeep_ops_read;
```

Put the pooled connection string in `DATABASE_URL_READONLY`. The bot token is `OPS_READ_TOKEN`, not the database password.

## Dry-run the backlog

The script only reads. It prints counts and up to 30 sample titles per bucket. It does not update listings.

Do not point it at production until the numbers have been read and a Neon snapshot exists. The production branch id is `br-polished-brook-a7bed0u2`. The script refuses that branch unless both flags below are set.

```bash
# A non-production database, read-only is enough:
OPS_BACKLOG_DRYRUN=report npx tsx scripts/ops-backlog-dryrun.ts

# Production, only after a snapshot and a yes in chat:
OPS_BACKLOG_DRYRUN=report OPS_BACKLOG_DRYRUN_PROD=1 npx tsx scripts/ops-backlog-dryrun.ts
```

The script does not call the model and does not geocode. Pairs that need a similarity score are counted as "would ask the model".

## Apply the backlog later

After the report is accepted:

1. Take a Neon snapshot of branch `br-polished-brook-a7bed0u2`.
2. Set `OPS_RESOLVE_BACKLOG=1` on the Vercel production environment.
3. Let the next quality cron run, or call `GET /api/cron/quality` with `Authorization: Bearer $CRON_SECRET`.
4. Watch `/admin/ops`. Undo is available for 30 days.
5. Remove `OPS_RESOLVE_BACKLOG` when the queue is caught up.
