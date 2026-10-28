# OUTZA

OUTZA is an Australian "what's on" events site. It pulls public events from lawful feeds into one board, lets people save favourites, build a night-out itinerary, and ask an AI search for ideas. It also has community listings (OUTZA Local), a promoter dashboard with paid promotions, and a weekly email newsletter (THE WEEKENDER).

Brand lockup: **OUTZA.** (orange dot). Tagline: **Get out. Get amongst it.**

Live site: [https://outza.abacusai.app](https://outza.abacusai.app)

Read [docs/handover.md](docs/handover.md) before changing the product. It covers features, owner rules, environment names, and the open to-do list. The app in this repository is the latest preview source, promoted from `nextjs_space/` to the repository root.

## Stack

- Next.js **16.4.1** (App Router, Turbopack) and React 19. Keep these majors as they are.
- TypeScript, Tailwind CSS 3.4, shadcn/ui and Radix UI
- Prisma 6 and PostgreSQL
- Auth.js / next-auth v5 beta (credentials and Google)
- Stripe (checkouts stay in test mode until `STRIPE_SECRET_KEY` is set)
- Leaflet maps, sharp for images, S3 for uploads

Hosting, the database, and deploys are managed on the Abacus.AI app platform. See the handover for the platform rules (async `params` / `cookies()` / `headers()`, no `middleware.ts`, no `webpack` key in `next.config.js`, additive Prisma changes only).

## Local setup

You need:

- Node.js 20.9 or newer (see `engines` in `package.json`)
- Yarn 4.10 (Berry). The lockfile is Yarn metadata version 8. Corepack ships with Node 20.
- PostgreSQL
- A `.env` file. Copy the names from `.env.example` and fill in values locally. The owner holds the real values. Leave `NEXTAUTH_URL` unset; the platform injects it.

```bash
cp .env.example .env
corepack enable
corepack prepare yarn@4.10.3 --activate
export YARN_GLOBAL_FOLDER="${YARN_GLOBAL_FOLDER:-$HOME/.yarn/berry}"
yarn install
yarn prisma generate
yarn dev
```

The dev server listens on [http://localhost:3000](http://localhost:3000).

A fresh local database needs the schema applied once:

```bash
yarn prisma db push
```

Use a local `DATABASE_URL`. Preview and production share one database, so a casual local session must stay off that URL. Schema changes have to stay additive. Do not pass `--accept-data-loss` or `--force-reset`.

`.yarnrc.yml` is the Abacus Yarn config and stays as it is. It stores the package cache under `/opt/hostedapp/node/yarn/global`, which a normal machine cannot create. `YARN_GLOBAL_FOLDER` points that cache at a writable directory for the session and does not change the committed file.

`scripts/seed.ts` upserts an admin user and will not run unless `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are set in the environment. Those names are intentionally absent from `.env.example`. Do not commit them, and do not run the seed against the shared database.

## Checks

```bash
yarn tsc --noEmit
yarn lint
yarn eslint --no-config-lookup --config eslint.ssr.config.mjs .
yarn build
```

`next lint` is not available on Next.js 16. Use `yarn lint`.

## Layout

Application code is at the repository root: `app/`, `components/`, `lib/`, `prisma/`, `auth.ts`, `instrumentation.ts`, `public/`. Paths in the handover that begin with `nextjs_space/` are relative to this root.
