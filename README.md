# VibePeep

VibePeep is an Australian "what's on" events site. It pulls public events from lawful feeds into one board, lets people save favourites, build a night-out itinerary, and ask an AI search for ideas. It also has community listings (VibePeep Local), a promoter dashboard with paid promotions, and a weekly email newsletter (THE WEEKENDER).

Brand lockup: **VibePeep** (Vibe in black, Peep in an orange-to-pink gradient) with the peeking-eyes icon. Tagline: **Take a peep at what's happening.** Sub-line: **Events · Experiences · Local discoveries.**

Live site: [https://outza-outza.vercel.app](https://outza-outza.vercel.app). `https://outza-sepia.vercel.app` is a legacy Vercel alias and 308-redirects to that host. Set `NEXT_PUBLIC_SITE_URL` only for a custom domain that replaces it.

Read [docs/handover.md](docs/handover.md) before changing the product. It covers features, owner rules, environment names, and the open to-do list. The app in this repository is the latest preview source, promoted from `nextjs_space/` to the repository root.

## Stack

- Next.js **16.4.1** (App Router, Turbopack) and React 19. Keep these majors as they are.
- TypeScript, Tailwind CSS 3.4, shadcn/ui and Radix UI
- Prisma 6 and PostgreSQL
- Auth.js / next-auth v5 beta (credentials and Google)
- Stripe (checkouts stay in test mode until `STRIPE_SECRET_KEY` is set)
- Leaflet maps, sharp for images, S3 for uploads

Hosting and deploys are on Vercel. The public origin is [https://outza-outza.vercel.app](https://outza-outza.vercel.app) unless `NEXT_PUBLIC_SITE_URL` names another public host. An `abacusai.app` value is ignored. LLM calls go through Vercel AI Gateway (OIDC on Vercel, `AI_GATEWAY_API_KEY` locally). Outbound email uses Yahoo SMTP when `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are set (`EMAIL_FROM` optional, otherwise `VibePeep <SMTP_USER>`). Resend is the fallback when `RESEND_API_KEY` is set and SMTP is not. Sending stays off when neither is configured. See the handover for the app rules (async `params` / `cookies()` / `headers()`, no `middleware.ts`, no `webpack` key in `next.config.js`, additive Prisma changes only).

## Local setup

You need:

- Node.js 22 or newer (see `engines` in `package.json`)
- Yarn 4.10 (Berry). The lockfile is Yarn metadata version 8. Corepack ships with Node.
- PostgreSQL
- A `.env` file. Copy the names from `.env.example` and fill in values locally. The owner holds the real values.

```bash
cp .env.example .env
corepack enable
corepack prepare yarn@4.10.3 --activate
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
