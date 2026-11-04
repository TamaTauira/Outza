# VibePeep QA report

Audit date: 4 November 2026. Production: https://outza-outza.vercel.app. Code base: `main` at `07e3b33`, plus the fixes in this change. No synthetic accounts were created. No payment was made. No bulk email was sent. No event rows were deleted.

## A. Executive summary

The public site is up. Home, map, saved, local, guides, login, legal pages, robots and the sitemap all returned HTTP 200. Signed-out calls to account, promoter and admin APIs returned 401. Cron routes returned 403 without the cron secret. Past events sampled from the database returned 404 on the public event API. Ask search rejected a one-character query with HTTP 400.

One confirmed security hole was open on production during the audit: `POST /api/refresh-events` ran a refresh with no session and no cron secret. An unknown source name returned HTTP 200. The scheduled refresh path (`/api/cron/refresh/<chunk>`) was already locked. This change requires the same cron-or-admin check on the leftover route.

Sign-in also accepted an unchecked `next` query and would navigate there after a successful login. That now stays on a same-site path. Local page import refuses loopback and link-local addresses, and a redirect is checked again before the page text is used. On a mobile Lighthouse run the Filters control had no accessible name because its label is hidden below the `sm` breakpoint, and the mascot minimise control was under 24px. Both are adjusted in this change.

Mobile lab performance is the largest remaining product gap: Lighthouse performance 70, LCP about 7.2s. Organiser, venue and admin dashboards were not signed into, so that part of the score is unassessed.

**Verdict: READY WITH MINOR ISSUES**

**Weighted score: 66 / 100**

The score counts the business-dashboard category as zero because it was not exercised with a real session. It assumes the security fixes in this change are deployed. Until this deploy is live, production still accepts unauthenticated `POST /api/refresh-events`.

## B. Feature inventory

| Area | Status | Notes |
| --- | --- | --- |
| Home board, filters, Ask search | Fully implemented | Ask works without a model key (rules parser). `ai` stays off until a gateway credential is set. |
| Map | Fully implemented | Leaflet. Geolocation is opt-in. Events with no coordinates cannot be pinned. |
| Saved and itinerary | Fully implemented | Guest state is in the browser. Account sync needs a session (not signed in here). |
| Event detail and Get Tickets | Fully implemented | Public past events 404. Ticket clicks are counted. Availability is not shown as live stock. |
| City and topic guides, sitemap, robots | Fully implemented | Sitemap index plus guide and event sitemaps. |
| Accounts (email, Google, birth year) | Fully implemented | Year of birth, not a full date. EU/EEA/UK under-16 block is in the signup API. Wrong password shows an error. |
| VibePeep Local | Fully implemented | `/local?tab=submit` is the community form. No required import URL. |
| Promotions, Pro, local ads, sponsorships | Fully implemented | Checkout requires a session (401 when signed out). Stripe webhook rejects a bad signature when configured. No live charge was made. |
| Promoter, venue and admin dashboards | Implemented, not session-tested | Signed-out pages render the login form. APIs return 401. |
| Ingestion crons | Fully implemented | Chunks in `vercel.json`. Protected. |
| Newsletter | Implemented, not sent | Unsubscribe and preview routes exist. No send was triggered. |
| PWA | Partial | Manifest, 192 and 512 icons, and the Apple touch icon return 200. No service worker. |
| Push and geofenced alerts | Planned, not implemented | No service worker, push, or geofence code. Not scored as defects. |
| Affiliate ticketing | Not used | Not added. |

## C. Test coverage

Statuses mean what the brief says. A row is PASS only where a request, browser, Lighthouse, SQL query or unit test was actually run.

| Feature | Test type | Result | Severity | Evidence |
| --- | --- | --- | --- | --- |
| Public pages (home, map, saved, local, legal, guides) | HTTP | PASS | — | 4 Nov production probe, all 200 |
| Robots, sitemap, manifest, icons | HTTP | PASS | — | 200. No `/sw.js` (404), see inventory |
| Ask “Markets this weekend” and a 1-character query | HTTP | PASS | — | 200 with a date window; 400 on `a` |
| Signed-out `/api/me`, promoter, admin | HTTP | PASS | — | 401 |
| Cron refresh and quality without a secret | HTTP | PASS | — | 403 |
| `POST /api/refresh-events` without a secret | HTTP then unit | FAIL then fixed | P1 | Production returned 200 for an unknown source. Unit test now expects 403 |
| Past event ids on the public API | HTTP | PASS | — | 404 for two `SCHEDULED` rows dated 2 Nov 2026 |
| Sydney board does not list dates before today | HTTP | PASS | — | 48 rows, earliest date 2026-11-04 |
| Security headers on `/` | HTTP | PASS | — | HSTS, nosniff, frame SAMEORIGIN, CSP, referrer policy |
| Public event JSON omits contact email | HTTP | PASS | — | Keys inspected on a Sydney row |
| SQL-looking city query | HTTP | PASS | — | Parameterised query still returned a normal page of events, not an error dump |
| Wrong password | Browser | PASS | — | Playwright, production `/login`, alert text shown, stayed on `/login` |
| Local publish not blocked by a required URL | Browser | PASS | — | `/local?tab=submit` has no `input[type=url]` |
| Signed-out admin, account, promoter | Browser | PASS | — | Login heading “Back for more?” |
| Home axe (WCAG 2 A/AA, desktop Chrome) | Browser | PASS | — | No serious or critical violations |
| Home Lighthouse (mobile lab) | Lighthouse | FAIL | P2 | Performance 70, accessibility 91, best practices 100, SEO 100 |
| Sign-in `next` stays on this site | Unit | PASS | P2 | `lib/safe-next.test.ts` |
| Import refuses 127.0.0.1 and 169.254.169.254 | Unit | PASS | P2 | `lib/local-extract-ssrf.test.ts` |
| Full unit suite | Unit | PASS | — | 401 passed (`yarn test`) |
| Typecheck and production build | Build | PASS | — | `tsc --noEmit` and `yarn build`. Build logs “Board seed failed” only because this environment has no `DATABASE_URL` |
| Promoter, venue and admin journeys | — | BLOCKED | — | No owner session was used |
| Stripe payment | — | NOT TESTED | — | Test mode only would be allowed. No charge was attempted |
| Email delivery | — | NOT TESTED | — | No messages sent |
| Push, geofence, service worker | — | NOT IMPLEMENTED | — | — |
| Itinerary save vs Saved count | — | NOT TESTED | — | Still on the handover list |

## D. Defect register

### QA-01 — Unauthenticated event refresh

- Feature: ingestion
- Severity: P1
- Expected: only cron or an admin can start a refresh
- Actual: `POST /api/refresh-events?source=qa-probe-not-a-source` returned 200 and `Unknown source`, with no cookie and no bearer token
- Steps: POST that URL with an empty body
- Cause: the route called `refreshSources` and never used `cronAuthorized`. Scheduled crons use a different path that was already protected
- Fix: the route now returns 403 unless cron or an admin
- Retest: `lib/refresh-events-auth.test.ts` passed. Live 403 is due after this deploy

### QA-02 — Sign-in open redirect

- Feature: login and signup
- Severity: P2
- Expected: `next` can only be a path on this site
- Actual: login and signup passed the query string to `router.replace`
- Steps: open `/login?next=https://example.com` and sign in (not completed against a real account; the code path is the one the new helper replaces)
- Cause: no allow-list
- Fix: `safeNextPath` in `lib/safe-next.ts`, used by login and signup
- Retest: unit test passed (external, protocol-relative and backslash targets fall back)

### QA-03 — Listing import could follow a redirect onto a private address

- Feature: Local import
- Severity: P2
- Expected: the final URL is checked, not only the URL the user pasted
- Actual: `readPage` blocked private addresses on the first host, then followed redirects
- Steps: unit test requests `http://127.0.0.1/` and `http://169.254.169.254/` and expects `ExtractError` before a fetch
- Cause: redirect target was not passed through the same check
- Fix: the response URL is resolved and rejected when it is private, localhost, `.local` or `.internal`
- Retest: private-address tests passed. A live open redirector was not set up

### QA-04 — Mobile Filters button had no accessible name

- Feature: home board
- Severity: P2
- Expected: the control has a name when the word “Filters” is hidden
- Actual: Lighthouse `button-name` failed on the `h-9` filters button. The label uses `hidden sm:inline`
- Steps: Lighthouse mobile, home page, 4 Nov 2026
- Cause: the accessible name was the visually hidden span, which is `display: none` on a phone
- Fix: `aria-label="Filters"`
- Retest: due on the next mobile Lighthouse run after deploy. Desktop axe already passed because the word is visible at desktop width

### QA-05 — Mascot minimise control was smaller than 24px

- Feature: mascot
- Severity: P2
- Expected: touch target at least 24 CSS pixels
- Actual: Lighthouse `target-size` failed on `button.vp-buddy-min` (about 23px on the roaming style, 20px on the base style)
- Fix: both sizes are 1.75rem (28px)
- Retest: due after deploy

### QA-06 — Local title had a max length and no counter

- Feature: Local submit
- Severity: P3
- Expected: the handover asked for `maxLength={100}` and an `n/100` counter
- Actual: the live community form already limited the field to 100 characters and did not show the count
- Fix: the community submit form shows `{length}/100`
- Retest: due on `/local?tab=submit` after deploy

### QA-07 — Mobile home performance is below the target

- Feature: home
- Severity: P2
- Expected: Lighthouse performance at least 90
- Actual: 70. LCP 7.2s, speed index 5.7s, CLS 0.01, total blocking time 150ms, main-thread work about 3.2s
- Steps: Lighthouse 13, mobile, 412×823, headless Chrome, one run, production `/`
- Cause: not reduced to a single asset in this pass. Server response was not the limiter
- Fix: not changed. A render pass that chases LCP would be a larger performance project
- Retest: not retested; no performance patch in this change

### QA-08 — Many active events have no map pin

- Feature: event data
- Severity: P2
- Expected: mapped events have coordinates
- Actual: 5,522 active events have a null latitude or longitude (SQL, 4 Nov 2026)
- Fix: not applied. A bulk geocode would write production coordinates and needs a reviewed job

### QA-09 — Imported copy still talks about ticket stock

- Feature: event data
- Severity: P3
- Expected: the product does not present live availability
- Actual: 33 active rows match “sold out” or “selling fast” in the title or description. The board does not add its own stock labels
- Fix: not applied. Rewriting source text needs a review

### QA-10 — Past rows remain stored as scheduled

- Feature: event data
- Severity: P3
- Expected: public pages hide events before today in the event’s city. They do
- Actual: 4,107 active rows are still dated more than a day ago and are not marked removed. Two samples 404 on the public API, and the Sydney list did not include them
- Fix: not applied. Rows were not deleted

## E. Performance comparison

Device: this audit environment, headless Chrome, Lighthouse mobile emulation (412×823, slow-4G style default). Network is the VM’s path to Vercel in Sydney (`syd1`).

| Check | Before this change | After this change |
| --- | --- | --- |
| Home Lighthouse performance | 70 | Not re-run. No performance patch |
| LCP | 7.2s | Unchanged in this change |
| CLS | 0.01 | Unchanged |
| TBT | 150ms | Unchanged |
| Accessibility | 91 (unnamed Filters button, small minimise control) | Code updated. Score not re-measured until deploy |
| Best practices | 100 | — |
| SEO | 100 | — |
| `GET /api/events?city=Sydney&limit=2` | about 320ms | Unchanged |
| `GET /sydney/events` | about 2.9s | Unchanged |
| `POST /api/ai-search` markets | about 440ms | Unchanged |

## F. Security summary

No secrets are included here.

What was checked and held:

- Account, promoter and admin APIs return 401 when signed out
- Cron routes return 403 without `CRON_SECRET` or an admin session
- Stripe webhook construction checks the signature and returns 400 when Stripe is not configured or the signature is bad
- Public event JSON does not include contact email
- HSTS (two years, includeSubDomains, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, a Content-Security-Policy and `Referrer-Policy: strict-origin-when-cross-origin` are present on `/`
- Signup stores a birth year. The under-16 country block is server-side. This audit did not spoof `x-vercel-ip-country` against production, because Vercel overwrites that header

What was fixed:

- QA-01 refresh route
- QA-02 sign-in redirect
- QA-03 import redirect check

What remains:

- CSP still allows `'unsafe-inline'` and `'unsafe-eval'` in script-src, which is common for this Next.js setup and was not changed
- `POST /api/events/[id]/click` increments a counter with no session. Not called, so it is not a confirmed production write from this audit. It is a recommended limit
- Signup was not load-tested. There is no application rate limit on account creation
- Password minimum remains 6 characters

## G. Automated improvements

- `app/api/refresh-events/route.ts` uses `cronAuthorized`
- `lib/safe-next.ts` used by login and signup
- `lib/local-extract.ts` re-checks the URL after a redirect and exports `isPrivateAddress`
- Home Filters button has `aria-label="Filters"`
- Mascot minimise control is 1.75rem
- Community listing title shows a 100-character counter
- `lib/linked-fill.test.ts` matches the current same-show linking rules from the 4 Nov release. Three tests were failing on `main` because they still expected an older “review” outcome. A review pair is still refused as a donor
- `package.json` script `test` runs the existing node:test suite (401 tests). Vitest was not added; the repo already uses `node:test`
- Playwright and axe: `e2e/public.spec.ts`, `playwright.config.ts`
- Lighthouse CI config: `lighthouserc.cjs` (warns below the brief’s targets, writes to `.lighthouseci`, does not upload)
- GitHub Actions: `.github/workflows/ci.yml` runs unit tests, then the browser smoke against production, on pull requests and on pushes to `main`
- Handover section 9 merged with this audit instead of a second backlog

`yarn tsc --noEmit`, `yarn test` (401 pass) and `yarn build` passed in this environment.

## H. Remaining risks

Known defects still open: QA-07, QA-08, QA-09, QA-10.

Blocked: promoter, venue and admin dashboards; a real Stripe test-mode checkout; email delivery.

Not implemented, and not defects: push notifications, geofenced alerts, a service worker. The manifest and icons are in place, so installability is partial.

Not tested: itinerary versus Saved count; contrast of every screen; a second Lighthouse run after the accessibility patch.

Recommended next improvements are in section I.

## I. Production readiness

| Category | Weight | Score | Evidence |
| --- | --- | --- | --- |
| Core functionality and user journeys | 20 | 16 | Public journeys executed. Signed-in organiser journeys blocked |
| Event data quality and freshness | 20 | 13 | All 10 cities have upcoming events. Gaps in QA-08, QA-09, QA-10 |
| Security and permissions | 20 | 16 | Auth boundaries held. QA-01, QA-02 and QA-03 fixed in this change, live 403 still to be confirmed after deploy |
| Performance and scalability | 15 | 8 | QA-07. APIs mostly under half a second. One guide about 2.9s |
| Mobile and PWA | 10 | 6 | Manifest and icons pass. No service worker. Mobile Lighthouse accessibility 91 before the button-name fix |
| UX and accessibility | 5 | 4 | Desktop axe clean. Wrong-password message confirmed |
| Business dashboards and analytics | 5 | 0 | Unassessed. No session |
| Operational reliability | 5 | 3 | Cron auth confirmed. No error-budget or paging check |
| **Total** | **100** | **66** | |

**Verdict: READY WITH MINOR ISSUES**

The public board, search, local listings and account gate are fit to stay in production. Do not treat the score as a claim that organiser dashboards were retested. Deploy this change, then confirm `POST /api/refresh-events` without a secret returns 403.

### Top 10 remaining improvements

1. Bring mobile LCP on the home board down. Lab result was 7.2s and performance 70.
2. Confirm the refresh route returns 403 in production after this deploy, and mark the GitHub Actions unit-test job as a required check.
3. Geocode the events that have no coordinates, as a reviewed job, so the map can show them.
4. Limit unauthenticated ticket-click counting so analytics cannot be inflated, without blocking a guest who taps Get Tickets.
5. Add a signup rate limit and raise the password minimum above 6 characters.
6. Re-run mobile Lighthouse after the Filters name and 28px minimise control ship, and finish the contrast and type-size pass.
7. Decide, with the owner, whether past `SCHEDULED` rows should be retired from promoter and admin views. Do not delete them.
8. Review the 33 imported “sold out” / “selling fast” phrases before any copy edit.
9. Set `AI_GATEWAY_API_KEY` or OIDC so Ask can use a model. Rules search already works without it.
10. Put a verified from-address on Resend, and set `BUSINESS_ABN` only when the real ABN is known. Give login and signup a way back to the board besides the logo.

### What the owner needs to do

- No new environment variable is required for these code fixes. `CRON_SECRET` is already what the other cron routes use.
- After deploy: `POST /api/refresh-events?source=qa-probe-not-a-source` with no Authorization header should be 403.
- In GitHub, require the “unit tests” check before merging to `main`. Vercel will still build without it until that setting is on.
- Optional, when ready: `AI_GATEWAY_API_KEY` (or OIDC), a verified `RESEND_FROM_EMAIL`, and `BUSINESS_ABN`. Do not invent an ABN.
