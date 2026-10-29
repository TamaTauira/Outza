# VibePeep — Developer Handover (for Claude)

_Imported with `nextjs_space/` promoted to the repository root. Paths below that start with `nextjs_space/` are relative to this repo root. The handover body is otherwise unchanged._

_Prepared 27 Oct 2026. Read this whole document before changing any code. It covers what the product is, how it's built and hosted, every major feature and where it lives, the owner's non-negotiable rules, the current release state and the open to-do list._

---

## 0. TL;DR

- **What:** VibePeep is an Australian "what's on" events website. It pulls public events from lawful feeds into one board, lets people save favourites, build a night-out itinerary and ask an AI search for ideas. It also has community listings ("VibePeep Local"), a promoter dashboard with paid promotions, and a weekly email newsletter ("THE WEEKENDER").
- **Brand:** wordmark **VibePeep** (Vibe in the text colour, Peep in an orange-to-pink gradient) and the peeking-eyes icon. Tagline **"Take a peep at what's happening."** Sub-line **"Events · Experiences · Local discoveries."** Fun, energetic, witty copy. Accents `#FF8A1A` to `#FF4E6A`.
- **Live:** https://outza-outza.vercel.app. `https://outza-sepia.vercel.app` 308-redirects there. Set `NEXT_PUBLIC_SITE_URL` only for a custom domain.
- **Stack:** Next.js **16** (App Router, Turbopack), React, TypeScript, Tailwind 3.4 + shadcn/Radix UI, Prisma + PostgreSQL, Auth.js / next-auth **v5 beta** (credentials + Google), Stripe (currently **not configured → test mode**), Leaflet maps (Esri tiles), sharp for images, S3 for uploads. LLM calls use Vercel AI Gateway. Outbound email uses Resend when `RESEND_API_KEY` is set and stays off otherwise.
- **Hosting:** Vercel. Deploys come from this git repository.
- **Owner:** the site owner (Sydney, AEST/AEDT). The owner admin account is `owner@outza.app` (role ADMIN). The password is **not** in this document; ask the owner.

---

## 1. How you (Claude) will work with this code

1. **Getting the code:** clone this git repository. Do not depend on an Abacus download or an Abacus agent conversation.
2. **Running locally:** you need Node 22+, yarn, a Postgres database and a `.env` (see §6 for variable names; the owner holds the values). Then `yarn install`, `yarn prisma generate`, `yarn dev`. **Never** point local dev at the production `DATABASE_URL` without care: dev and prod share **one** database.
3. **Getting changes live:** open a pull request. Vercel deploys from git. Do not paste files into an Abacus conversation and do not call `apps.abacus.ai`.
4. **Before handing back a change:** make sure `yarn tsc --noEmit` and `yarn build` pass. There's also an SSR-safety lint: `yarn eslint --no-config-lookup --config eslint.ssr.config.mjs .` (blocks hydration mistakes: see §7).

### Platform rules you must not break

- **Next.js 16 only.** Don't upgrade or downgrade Next or React majors.
- `params`, `searchParams`, `cookies()`, `headers()` are **async** (await them). Page props: `{ params: Promise<{ id: string }> }`.
- No `middleware.ts`: Next 16 uses `proxy.ts` (export `proxy`). There isn't one at the moment.
- Turbopack: **never** add a `webpack` key to `next.config.js`.
- `next lint` doesn't exist: use `yarn lint` (eslint).
- **Prisma:** never hand-edit the `generator client` block in `prisma/schema.prisma` (the platform rewrites it). Import from `@prisma/client`. Schema changes must be **additive/compatible** (`prisma db push` without `--accept-data-loss`). Never `--force-reset`.
- **Database is shared by preview and production.** Never delete rows in scripts or seeds. Soft-remove via `status` (e.g. `REMOVED`) or `duplicateOfId`. Limits: 25 connections, **5-second statement timeout**, short idle timeout. Reuse the single Prisma client (`lib/db.ts` / `lib/prisma.ts`).
- Files: never write uploads to local disk; use S3 (`lib/s3.ts`, `lib/aws-config.ts`). Store `cloud_storage_path` only.
- Do not add `https://apps.abacus.ai/chatllm/appllm-lib.js` or any other Abacus script. Client crashes go through `components/report-crash.ts`.
- Public links use `siteUrl()` (`lib/site-url.ts`). It never falls back to an `abacusai.app` host. A missing or wrong `NEXTAUTH_URL` resolves to `https://outza-outza.vercel.app`.
- No system binaries in production (no python, ffmpeg, LibreOffice, Playwright). Pure Node packages only.
- Never use `\uXXXX` escapes for non-ASCII characters in source; write the real character.

---

## 2. Release state right now (important)

This table is the import-time preview list. Hosting is Vercel now; it is not an Abacus checkpoint list. Several finished changes were saved but not yet on the old hosts when this note was written:

| State | Change |
|---|---|
| Deployed (live) | VibePeep Local duplicate fix + "type" labels (sale vs event) |
| Preview only | Past events hidden everywhere (board, event page 404, saved, itinerary) |
| Preview only | "Back to events" restores scroll + filters |
| Preview only | Account "vibe profile" + Follow promoter button on event pages; privacy notes removed from the account page |
| Preview only | Suburb slug collision fix (`lib/seo-server.ts` `citySuburbs`) |
| Preview only, **partial** | VibePeep Intelligence (promoter venue/area insights), see §4.12 |
| Preview only | `/map` and `/saved` real URLs, Saved-count fixes, board fixes (see §8) |

If the owner hands you the downloaded source, it contains **all** of the above (the source on disk = latest preview).

---

## 3. Project layout

```
nextjs_space/
  app/
    (board)/            route group: the home board
      layout.tsx        renders {children} + <HomeClient/> (one shared client for /, /map, /saved)
      page.tsx          "/" (JSON-LD, canonical)
      map/page.tsx      "/map" (returns null; HomeClient shows the map view)
      saved/page.tsx    "/saved" (returns null; HomeClient shows "The keepers")
    [city]/[topic]/     SEO landing pages (/sydney/live-music etc.); /[city] redirects
    events/[id]/        event detail (id param is "<slug>-<id>"); _components/
    local/  local/[slug]/   VibePeep Local browse/submit/mine/how + detail
    itinerary/          itinerary page, stop-form.tsx, route-picks.tsx
    account/            profile, About you, vibe card, digest prefs
    promoter/           promoter dashboard (tabs) + invoice/[id]
    promoters/          public pricing page
    admin/              images, intel, local, newsletter, seo, trust
    login/ signup/ privacy/ disclaimer/ how-listings-work/ unsubscribe/
    api/                route handlers (list in §5)
    error.tsx, global-error.tsx, robots.ts, sitemap.ts, layout.tsx, globals.css
  components/           shared UI (navbar, home-client, event-list, board-row, map-view, ai-search-bar, ...)
    ui/                 shadcn components
  lib/                  server + shared logic (see §4)
    sources/            event feeds (curated, eventbrite, promoters, ticketing)
    newsletter/         THE WEEKENDER pipeline
    images/             image enhancement pipeline
    intel/              VibePeep Intelligence
  prisma/schema.prisma
  auth.ts               Auth.js v5 config (credentials + Google)
  instrumentation.ts    background schedulers (see §4.14)
  STYLE_GUIDE.md        UI component guide
```

Note: `zz_backfill.ts` in the app root is a one-off image backfill script, not part of the app.

---

## 4. Features and where they live

### 4.1 Cities
`lib/cities.ts` has `CITIES`: Sydney (default), Melbourne, Brisbane, Gold Coast, Perth, Adelaide, Canberra, Newcastle, Hobart, Darwin. Each has a timezone, radius, feed settings and a `custodians` field. `''` = all of Australia. Dates are always worked out in the **event's city timezone**.

### 4.2 Event ingestion ("refresh")
- `lib/refresh.ts` → `refreshAllSources()` runs every 2 hours (plus on startup if stale). `SOURCES` includes Ticketmaster (`lib/ticketmaster.ts`, `TICKETMASTER_API_KEY`), Eventbrite + Humanitix (`lib/sources/eventbrite.ts`), City of Sydney and promoter sites (`lib/sources/promoters.ts`), Moshtix (official open GraphQL `api.moshtix.com`), Oztix (public Algolia index, `OZTIX_ALGOLIA_KEY`), Ticketek (**licensed feed only**, see below) and curated regulars (`lib/sources/curated.ts`).
- Saving/dedupe: `lib/event-store.ts` (`saveEvent`), `lib/event-store-parts.ts`, `dedupeHash`. If a promoter edited a listing (`organiserEditedAt`), refreshes only touch sources/lastVerifiedAt/CANCELLED.
- Categorising: `lib/categories.ts` `classifyCategory` (Music + comedy/theatre/circus/cabaret now → Arts & Culture; only affects new/refreshed rows), `checkLGBTI`, `checkFree`, `guessSuburb`.
- Quality: `lib/quality.ts`, `lib/quality-pass.ts`, `PROVIDER_POLICY` (stays "Needs review" until confirmed).
- After refresh, `lib/local-import.ts` imports public community events into VibePeep Local.
- **Ticketek:** never scrape or bypass blocks. `fetchTicketekEvents` runs only with impact.com affiliate env vars (`IMPACT_ACCOUNT_SID`, `IMPACT_AUTH_TOKEN`, `IMPACT_TICKETEK_CATALOG_ID`) or a partner feed (`TICKETEK_FEED_URL`, `TICKETEK_FEED_AUTH`). Images only if `TICKETEK_IMAGES_ALLOWED=1`. Affiliate deep links: `lib/affiliate.ts` `ticketHref()` + `NEXT_PUBLIC_TICKETEK_AFFILIATE_LINK`.
- **Ticket availability is never set from feeds or shown as live.** JSON-LD never includes availability.

### 4.3 Home board, map, saved (`app/(board)` + `components/home-client.tsx`)
- One client component (`HomeClient`) serves `/`, `/map`, `/saved`; the view comes from `viewForPath(usePathname())` in `components/navbar.tsx`. Old `?view=map|saved` URLs redirect.
- Board: hero with Ask VibePeep AI search, "Hot right now" featured band (`components/featured-turnstile.tsx`, `/api/featured`: promoted first, topped up with hot events when fewer than 8), filters (`components/filter-panel.tsx`), day/time window chips (default "Now & next"), list (`components/event-list.tsx`) of rows (`components/board-row.tsx`).
- Board rows: the whole row is clickable (keyboard focus ring); title wraps to 2 lines; finish time shown smaller under the start time; Save + compact "+" itinerary button side by side. Ended events are hidden unless the user ticks "Show ended".
- Map: `components/map-view.tsx` (Leaflet + markercluster, Esri tiles from `lib/map-style.ts`). Geolocation is opt-in; localStorage `outza-location-v1` stores **consent only, never coordinates**. Map view has a light "Map it out." header + city select, no hero.
- Saved ("The keepers."): `components/saved-board.tsx`, `lib/saved.ts` (localStorage + account sync via `/api/me/saved`; removals tracked in `sydney-events-saved-removed-v1`, so account sync doesn't resurrect them). The navbar badge uses the same list.
- Navbar (`components/navbar.tsx`): tabs Board · Map · Local · Saved · Itinerary (Links with aria-current). Guest Sign In / Sign Up / For promoters links hide on small screens.

### 4.4 Ask VibePeep AI search
`components/ai-search-bar.tsx` → `POST /api/ai-search`. The LLM only converts text into filters; results are always real database listings. Relative dates are resolved in code. Quick-pick chips (When / Budget / Vibe / Suburb / Clear Picks) are sent as `hints` and override the parsed text. Keep the city select and the disclaimer under it. (This replaced a removed "Your next great night out" card. **Don't re-add that card.**)

### 4.5 Event detail (`app/events/[id]`)
- `lib/event-detail.ts` `getEventDetail` returns null for past events (→ 404). Canonical URL `eventPath()` = `/events/<slug>-<id>`.
- `_components/event-detail-client.tsx` + `event-extras.tsx` (gallery, last verified + original listing link + share, map via `components/venue-map.tsx`, getting there, organiser, accessibility, age). These fields come from sources or the promoter form only; **never infer them** (show "The organiser hasn't listed…").
- Images: always `components/event-image.tsx` (`EventImage`) with the API's `imageAsset` payload. Badges over images need `z-10`.
- Trust: `components/listing-trust-actions.tsx` (Report/Claim, anchors `#report`/`#claim`), `lib/trust.ts`, `lib/claims.ts`; admin `/admin/trust`.
- Follow promoter: `components/follow-promoter-button.tsx` → `/api/promoters/[id]/follow` (PromoterFollow).
- Local business recommendations (paid LocalAds, labelled Sponsored): `components/local-recommendations.tsx`.
- "Back to events" must use `components/back-to-events-link.tsx` (never a plain `<Link href="/">`).

### 4.6 Itinerary (separate from Saved!)
`lib/itinerary.ts` (localStorage `outza-itinerary-v1`, server sync), `/itinerary`, `components/itinerary-button.tsx`. Custom stops need start and end times (end before start = past midnight). Overlaps via `clashMap()`; users can dismiss per pair (`okWith`). Custom stops are editable through `app/itinerary/stop-form.tsx`. Between stops, `app/itinerary/route-picks.tsx` offers an opt-in dropdown of paid LocalAds (labelled Sponsored; impressions counted only when opened). Geocoding: `/api/itinerary/locate`. Travel helpers: `lib/travel.ts`.

### 4.7 Accounts, auth, profile
- `auth.ts`: Auth.js v5 with credentials (bcrypt) and Google (`allowDangerousEmailAccountLinking`). Protect pages/APIs with `auth()` from `@/auth` (there's **no** `getServerSession`/`authOptions`). Helpers in `lib/session.ts` (`getSessionUser`, `isPromoter`, `unauthorized`, `forbidden`). Client: `const { data: session, status } = useSession() || {}`.
- Roles: CONSUMER, PROMOTER, ADMIN. Google users can upgrade to PROMOTER (`PATCH /api/me {role:'PROMOTER'}`, `app/promoter/become-promoter.tsx`).
- Event-goers must give a date of birth (13+; `User.birthDate`); home postcode is optional. Collected at signup, Account → About you, and `components/profile-gate.tsx` (modal; skipped on /privacy, /how-listings-work, /disclaimer, /login, /signup). Helpers: `lib/profile-shared.ts`.
- Vibe profile (optional questions, `User.vibeProfile` JSON): `lib/vibe-shared.ts`, `app/account/vibe-card.tsx`. Bio is never shared.
- `/login` has an Event-goer/Promoter toggle (`?as=promoter`).

### 4.8 Promoters and money
- Dashboard `/promoter` (`app/promoter/promoter-client.tsx`) tabs: Overview, Intelligence, Promote an event, My events, Local business ads, Pro & billing.
- Pricing in **`lib/tiers.ts` only** (server-side `quote()`): Boost $19/7d, Spotlight $49/14d, Headliner $99/30d (DB keys SILVER/BRONZE/GOLD). Add-ons FRONTROW and SPOTLIGHT (shown as "Newsletter boost"). Promoter Pro (ProPass + `User.proUntil`, 15% off, verified badge, analytics). Local business ad $59 flat (`LOCAL_AD`).
- BUSINESS_PLANS (Free / Local Pro $39 / Growth $99 / Venue Plus $199 monthly) are "Coming soon" with Register interest until recurring billing exists.
- Checkout: `/api/promotions/checkout`, `/api/local-ads/checkout`, webhook `/api/webhooks/stripe`, activation in `lib/promotions.ts`. **`STRIPE_SECRET_KEY` is not set, so checkouts activate instantly in "test mode" (free).** Going live needs `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`.
- Invoices `/promoter/invoice/[id]` (GST shown as 1/11, no invented ABN).
- Listing edits: `PATCH /api/promoter/events/[id]`. Referrals: `lib/referrals.ts` (EventReferral). Weekly performance report: `lib/promoter-report.ts`, `/api/promoter/report`, `/api/cron/promoter-reports`.
- **Audience insights** (`lib/audience-insights.ts`, `app/promoter/audience-card.tsx`, `/api/promoter/insights`): grouped percentages only, **groups under 10 hidden** (`MIN_GROUP=10`), audience size rounded down to 10s, promoter's own activity excluded, never exact age/birthday/postcode/name/email. Always labelled as interest data, not purchaser data (VibePeep doesn't sell tickets). Signals: EventSignal (VIEW/TICKET/SHARE/ITINERARY) via `lib/event-signals.ts`.
- Placements are always labelled "Sponsored". Never promise guaranteed impressions or clicks.

### 4.9 VibePeep Local (community listings)
- `/local` (tabs `?tab=browse|submit|mine|how`), `/local/[slug]`, admin `/admin/local`. Server logic `lib/local.ts`, client-safe `lib/local-shared.ts`. Categories GARAGE / WAREHOUSE / MARKET / COMMUNITY. Only GARAGE/WAREHOUSE are "sales" (`isSaleCategory`).
- Submission pipeline: honeypot, fast-fill check, rate limit (5/24h), regex hard-blocks (private/invite-only, banned items), AI moderation that only flags, Nominatim address check, duplicate detection, auto-expiry, 3 reports → back to review.
- Recurrence stored once (weekly / fortnightly / monthly nth, max 6 months) and expanded at read time.
- Import card (`app/local/local-import-card.tsx` → `/api/local/extract`, `lib/local-extract.ts`): link or PDF/.docx/.txt; facts only; Facebook/Instagram refused.
- Photo: `app/local/local-image-field.tsx` → `/api/local/image` (WebP ≤1600px, EXIF stripped, rights checkbox enforced server-side).
- Imports from board sources (`lib/local-import.ts`): facts only, no images, always linked to source, never overwrite moderation. `dedupeLocalListings()` links copies via `duplicateOfId` (never deletes). Duplicate detail pages 301 to the kept listing.

### 4.10 SEO
`lib/seo.ts` (TOPICS, `isPastEvent`, `eventPath`), `lib/seo-server.ts` (`landingData`, `citySuburbs`, `requestOrigin`, `jsonLdString`). Guides are indexed only with ≥5 live listings (suburb pages ≥3), otherwise `noindex,follow`. Dynamic `app/robots.ts` and `app/sitemap.ts`. Footer "Popular guides" has one column per city. `/admin/seo` uses only VibePeep's own data: **never fabricate** impressions, clicks, rankings or search volumes. Verification tags from `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION`.

### 4.11 Newsletter (THE WEEKENDER)
`lib/newsletter/*` (rank, copy, images, render, qa, links, index); `lib/digest.ts` → `sendNewsletter`. Hourly check sends due daily/weekly/monthly digests. Admin preview/test at `/admin/newsletter`. AI copy must stay grounded; a BANNED regex blocks unverifiable claims (sold out, popular, discounts, $, %). Subjects validated by `goodSubject()` (16–60 chars, not similar to the last 12, never names sponsored events). Sponsored block: max 2 (SPOTLIGHT first, then GOLD), always labelled. QA failures block sends. Tracking: `/api/nl/o`, `/api/nl/c`, unsubscribe `/api/nl/unsubscribe`.

### 4.12 VibePeep Intelligence (partial, preview only)
Promoter tab "Intelligence" (`app/promoter/intel-tab.tsx` → `/api/promoter/intel?eventId=`, owner/ADMIN, audit-logged). `lib/intel/*`: official open data only (ABS census/SEIFA/regional, ABS household spending indicator, TfNSW Opal taps + stops, Destination NSW). 12h cache. NSW venues only. Admin `/admin/intel`; hourly ingest; manual `POST /api/cron/intel`.
Rules: no mock data; never present LGA/state figures as suburb figures; SEIFA is area context; household spending indicator labelled as such; transport patronage ≠ attendance; no fabricated travel times; tourism points are hypotheses; no revenue predictions. Advisor output format: Insight / Business implication / Recommended action / Evidence / Confidence / Measurement.
**Still to do:** deeper advisor output, acceptance tests, a sources document, Google Business Profile connection (needs Google API approval; GBP tables exist but aren't connected).

### 4.13 Images
`lib/images/*`: non-generative pipeline (Lanczos upscale + integrity checks). Never crop poster text (contain over a blurred extension). A failed enhancement never replaces a usable original. Admin `/admin/images`. **Never republish images without permission** (imports from Local sources carry no images).

### 4.14 Background jobs (`instrumentation.ts`)
On the Node runtime: refresh every 2h (startup if stale), digests hourly, owner jobs hourly (`lib/owner-alerts.ts`: fortnightly ideas summary when there are new suggestions; health checks), Intelligence ingest hourly. `onRequestError` records uncaught server errors for the owner (production only, deduped) and emails them when Resend is configured. Cron endpoints accept header `x-cron-secret: $CRON_SECRET` or an ADMIN session: `/api/cron/digest`, `/api/cron/owner-alerts`, `/api/cron/promoter-reports`, `/api/cron/intel`.

### 4.15 Email + AI
- Email: `lib/email.ts` `sendEmail` POSTs to Resend (`https://api.resend.com/emails`) when `RESEND_API_KEY` is set. From is `RESEND_FROM_EMAIL`, or `VibePeep <onboarding@resend.dev>` when that is unset. That shared sender does not need a custom domain. With no key, `emailSendingEnabled()` is false and `sendEmail` returns disabled without calling a mail API. Scheduled digests, weekly promoter reports, and owner mail follow that flag and keep their own skip rules (not due, no events, not production, and so on). Do not point this at Abacus.
- LLM: `lib/llm.ts` calls Vercel AI Gateway with the `ai` package (`generateText` + `Output.json()`). On Vercel the deployment's OIDC token authenticates the request. Locally set `AI_GATEWAY_API_KEY`. Model id is `AI_GATEWAY_MODEL`, or `openai/gpt-5.4-mini` when that is unset. Used by ai-search, local moderation, flyer/page extract, newsletter copy, and the Destination NSW PDF extract. PDFs go to the model as file parts; don't add PDF-parsing libraries.

---

## 5. API routes (app/api)

admin/{images,intel,local,newsletter,trust} · ai-search · alerts/client-error · auth/[...nextauth] · auth/login · cron/{digest,intel,owner-alerts,promoter-reports} · events · events/[id] · events/[id]/{attend,claim,click,report,signal} · events/stats · featured · friends · itinerary/locate · local · local/[id] · local/extract · local/image · local-ads · local-ads/[id]/go · local-ads/checkout · local-ads/itinerary · local-ads/mine · me · me/digest-preview · me/saved · nl/{c,o,unsubscribe} · promoter/{claim,events,events/[id],insights,intel,report} · promoters · promoters/[id]/follow · promotions/checkout · refresh-events · signup · suggestions · webhooks/stripe

Every route that touches user data calls `auth()` / `getSessionUser()` and derives the user id from the session.

---

## 6. Data model and environment

**Prisma models:** Event, ImageAsset, ImageHistory, ImageRun, RefreshLog, User, Account, Session, VerificationToken, SavedEvent, Attendance, EventSignal, Friendship, PromoterFollow, Promotion, LocalAd, ProPass, Suggestion, OwnerAlert, EventReport, EventReferral, EventClaim, NewsletterSend, NewsletterClick, EventBlurb, LocalListing, IntelSource, IntelIngestJob, IntelDataset, IntelObservation, IntelArea, IntelTransportStop, IntelVenueGeo, IntelCache, GoogleBusinessConnection, GoogleBusinessMetric, GoogleBusinessKeyword, IntelAuditLog. Read `prisma/schema.prisma` for fields. (Event has no `sourceUrl` field; `ticketUrl` + `source` carry provenance.)

**Environment variables (names only; the owner holds values):**
- Set today: `DATABASE_URL`, `NEXTAUTH_SECRET`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TICKETMASTER_API_KEY`, `OZTIX_ALGOLIA_KEY`, `AWS_PROFILE`, `AWS_REGION`, `AWS_BUCKET_NAME`, `AWS_FOLDER_PREFIX`.
- AI Gateway: `AI_GATEWAY_API_KEY` for local/non-Vercel calls. Vercel deploys use `VERCEL_OIDC_TOKEN`. Optional `AI_GATEWAY_MODEL` (a `provider/model` id). There is no `ABACUSAI_API_KEY` or `WEB_APP_ID`.
- Email: `RESEND_API_KEY` turns sending on. Optional `RESEND_FROM_EMAIL` (default `VibePeep <onboarding@resend.dev>`). Do not send from `@outza.app`.
- Read by code but **not set** in `.env`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (→ payments run in test mode), `CRON_SECRET` (→ cron endpoints only work for ADMIN sessions), `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, `INTEL_ENC_KEY`, Ticketek/impact vars, `NEXT_PUBLIC_TICKETEK_AFFILIATE_LINK`.
- `NEXT_PUBLIC_SITE_URL` is the public origin override. Do not set it to an Abacus host.

---

## 7. Coding conventions

- **Hydration safety:** no `Math.random()`, `Date.now()`, `new Date()` or `window`/`localStorage` in render or state initialisers. Use `components/client-only.tsx` (`useMounted`, `ClientOnly`) and `components/safe-format.tsx` (`SafeDate`, `SafeTime`, `SafeNumber`, which take an Intl `options` prop, not a format string). `toLocale*`/`Intl` always get an explicit locale plus `timeZone`. Email/phone text goes in its own `<span suppressHydrationWarning>`.
- **Client-safe vs server modules:** `*-shared.ts` files (local-shared, profile-shared, trust-shared, vibe-shared, local-ads-shared, referral-labels) are safe to import in client components; others may import Prisma.
- **Scroll memory:** `lib/scroll-memory.ts`: `installScrollMemory()` (in `components/providers.tsx`) restores scroll on Back/Forward; `useBackState(key, initial)` keeps filters/expanded sections across Back. New list/filter pages should use it. `/`, `/map`, `/saved` count as list pages.
- **Images:** next/image with `fill` inside a `relative` fixed-aspect container; meaningful alt text; error fallback.
- **UI:** reuse shadcn components in `components/ui` and `STYLE_GUIDE.md`. Shadows over heavy borders, generous whitespace, mobile-first. Body text ≥14px (16px on mobile), WCAG AA 4.5:1 contrast.
- **Logo:** `components/vibepeep-logo.tsx` (VibePeepLogo lockup + `VIBEPEEP_TAGLINE`), mark `components/vibepeep-mark.tsx`, mascot `components/vibepeep-mascot.tsx`. Icon is `/vibepeep-icon.svg` (transparent outside the rounded square). Wordmark is `/vibepeep-wordmark.png` on light and `/vibepeep-wordmark-ondark.png` (white Vibe) on dark — no cream plate. Mascot is `/vibepeep-mascot.webp`.
- **Files in `public/`:** never overwrite in place; add under a new name or bump `?v=N` (browsers cache).
- No unused imports, no placeholder code, no dead links. Header/footer links only to pages that exist.

---

## 8. Owner's rules (non-negotiable; check every change against these)

1. **Never present ticket availability as live** unless it's verified. No "sold out", "selling fast", "x left".
2. **Brand lockup:** wherever the icon + "VibePeep." appear, show "Take a peep at what's happening.". Write **LGBTIQ+** (not LGBTI/LGBTQ). Wordmark uses the black-outline font.
3. **Saved favourites ≠ itinerary.** Keep them separate. "Itinerary" is in the profile menu and is a top quick-link.
4. **No scraping private social media events; no republishing images without permission.**
5. **Copy is fun, energetic, witty.** Legal/trust copy stays plain (Acknowledgement of Country, disclaimer, privacy, listing rules, Sponsored labels, payment/test-mode notices, invoices, "confirm with organiser"). Witty copy never claims sell-outs, popularity numbers or guaranteed results, and avoids slang borrowed from First Nations culture (e.g. "walkabout").
6. **No map/board shortcut buttons** in the toolbar (switch via navbar tabs only) and **no "Your next great night out" card** (its questions live in Ask VibePeep). Itinerary button sits next to Save.
7. **Promoter data anonymised:** grouped stats only, groups under 10 hidden, never exact ages, birthdays, postcodes or addresses.
8. **Ticketek only via lawful partner/affiliate feeds.** No loopholes, no scraping, no bypassing blocks. Same spirit for every source: official APIs/feeds only.
9. **Preserve existing branding, functionality, dashboard, auth, payments and UX. No full redesigns.** Make the smallest change that does the job.
10. **Never show events dated before today** (in the event's city timezone), and **restore the user's last scroll position** when coming back from an event.

More owner preferences:
- **Copy changes need approval:** propose 3 options per area and let the owner pick before editing copy. Past picks are in `outza_copy_review.md` (not in the zip; ask the owner).
- Copy conventions: buttons in Title Case, everything else sentence case; "Back to events"; always "Tap", never "Click"; "Promoter dashboard"; "VibePeep Local" in headings, "Local" in the navbar; saved view is "The keepers."; menu label "Itinerary".
- Acknowledgement of Country lives in the footer (with Aboriginal flag), auth pages and the email footer. **Don't** put the custodians line back on the home header (owner removed it).
- Don't reintroduce old names "Aussie Events" / "Sydney Events".
- Imported VibePeep Local listings: facts only, link to source, no images, never overwrite moderation.
- Never fabricate data anywhere (SEO stats, audience numbers, intelligence figures, availability).
- The owner gets frustrated when a fix is claimed but not actually working. Test the exact scenario they reported before saying it's fixed, and be honest about what you didn't test.

---

## 9. Open to-do list (from the owner's latest requests)

**Done in preview, not deployed:** `/map` + `/saved` URLs (Back works, bookmarkable); Saved badge/list mismatch; board search double ×; selected Free chip readable; whole board row clickable with focus state; titles wrap to 2 lines; hide ended events by default ("Show ended" opt-in, default "Now & next"); comedy/theatre no longer classed as Music for **new** rows.

**Not done yet (priority order):**
1. **VibePeep Local "Publish free listing" is blocked** by the browser message "Please enter a URL": the import card's `required` URL input sits inside the same `<form>` as the listing form. Split them into separate forms (`app/local/local-submit-form.tsx`, `app/local/local-import-card.tsx`, `app/local/local-client.tsx`).
2. Local title: add `maxLength={100}` + "n/100" counter (server already trims to 100 in `lib/local.ts` `parseLocal`).
3. Local tab: first tap sometimes does nothing / no loading indicator (`local-client.tsx` `setTab` uses `router.replace`). Local list titles get cut off (allow 2 lines).
4. `/login`: wrong password shows no error (`app/login/page.tsx`: `signIn(..., { redirect: false })`, then check `res?.error` and show a message). Login/signup pages have no site navigation (`components/auth-shell.tsx`).
5. Itinerary page header: guest links (For promoters / Sign In / Sign Up) hidden on small screens. Make them reachable on mobile (e.g. in a menu) without a redesign.
6. Ask VibePeep: layout shift when results open (reserve space / min-height in `components/ai-search-bar.tsx`).
7. Event detail with no image: branded fallback hero (category colour + title) instead of an empty block (`event-detail-client.tsx`, `components/event-image.tsx`).
8. Map: skeleton while loading and show the list meanwhile (`components/map-view.tsx`).
9. "Hot right now" carousel: pause control, respect `prefers-reduced-motion`, consistent aspect ratio, subtle overlay for text legibility (`components/featured-turnstile.tsx`).
10. Existing DB rows: comedy/theatre still tagged Music until refreshed; consider a one-off safe re-classify script (update only, no deletes).
11. "Tai Chi for Eveyone" typo: check whether the source feed spells it that way. Don't overwrite moderated or organiser data without the owner's OK.
12. Accessibility pass: text ≥14px (16px mobile), contrast 4.5:1 site-wide.
13. Ask the owner whether past events should also be hidden on promoter/admin dashboards.
14. `app/error.tsx` back link should use the Back-to-events component.
15. VibePeep Intelligence remaining work (§4.12).
16. Not yet browser-tested: adding to the itinerary while saving (should never change the Saved count).

---

## 10. Testing checklist before handing back any change

- `yarn tsc --noEmit` passes; `yarn build` passes; SSR lint passes.
- The owner's exact reported scenario reproduced and now fixed (mobile width ~390px as well as desktop).
- No past events visible; Back from an event returns to the same scroll spot and filters.
- Saved count = Saved list; itinerary untouched by saving.
- Sponsored labels present on every paid placement; no availability or popularity claims.
- No new console errors or hydration warnings.
- Say clearly what you verified and what you didn't.
