# Operations

Hands-off trust decisions for VibePeep. Bots may approve or dismiss items above the confidence thresholds. Every decision is stored and can be undone for 30 days. Nothing is deleted.

Times below are Australia/Sydney (AEDT in November).

## What runs

- The daily quality cron also runs the auto-resolver, after the quality pass, inside the function time limit. It only touches rows created after the first run records `live-since`. The backlog that was already waiting stays untouched.
- Monday 9:00 am AEDT (`0 22 * * 0` UTC) sends one approvals email to the owner, and only when something is waiting. Each Approve and Decline link expires in 14 days and works once.
- `/admin/ops` lists the latest 50 decisions, with Undo, and the rule switches. Rules default to on.

Protests and rallies stay hidden. A cooking or product demonstration is not treated as a rally. Contact form mail is unchanged and still goes to the owner's Gmail.

## Environment

Set these on the Vercel project. This repository does not create them.

| Name | Where | Value |
|---|---|---|
| `OPS_DIGEST_SECRET` | Production (and Preview if you send test mail) | A random string of at least 16 characters. Signs the Monday links. If it is unset, `CRON_SECRET` is used. |
| `OPS_RESOLVE_BACKLOG` | Do not set | Leave unset. Setting it to `1` lets the live resolver change rows that existed before `live-since`. That is a production data change and needs a Neon snapshot plus a yes in chat first. |

`CRON_SECRET` is already required for the crons.

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
