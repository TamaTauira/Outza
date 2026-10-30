# Short boosts and organiser plans

Evening passes, day passes and monthly organiser plans sit beside the existing 7, 14 and 30 day packages. Packages, Promoter Pro and local recommendations are unchanged.

## What a visitor sees

Paid cards in Hot right now are labelled Sponsored. They are mixed with organic matches and kept to at most one third of that band. When organic matches exist, the band is never entirely sponsored, and it starts with an organic card. The main board stays in time order. A live short boost only adds the Sponsored label. It does not jump the queue.

Event pages still show the prominent Get tickets or More info link.

## What an organiser can do

On the promoter dashboard, Short boosts:

- Pick an event, an evening pass ($9) or day pass ($15), a start, an end, a headline and an optional lower impression cap.
- Preview the Sponsored card before paying.
- See impressions, detail views, Get tickets clicks and repeat interest, with the attribution limits written on the page.
- Run the same boost again. That is a new checkout. It does not charge by itself.
- Refund a boost that has not been shown, inside 48 hours of the start (7 days on Venue Plus).

Pro & billing holds the monthly plans:

| Plan | Price | What it adds |
|---|---|---|
| Free | $0 | One short boost at a time. Listing stays free. |
| Local Pro | $39 / month | Five short boosts at once. Invoices. Self-serve change and cancel. |
| Growth | $99 / month | Fifteen short boosts, schedule 60 days ahead, hourly results, CSV export. |
| Venue Plus | $199 / month | Forty short boosts, pause them, 7-day refund window when nothing has been shown. |

Promoter Pro remains a separate 30-day pass and still takes 15% off short boosts.

Upgrades charge the prorated difference now, and only after the consent tick. Downgrades wait until the period already paid. Cancel stops the next renewal and keeps the current period. There is no trial.

## Payments

Stripe is the provider. A boost or plan stays pending until `checkout.session.completed` has `payment_status=paid`, or the return URL asks the server to retrieve that same session. A $0 session is cancelled and never goes live. A Stripe subscription that arrives as `trialing` is cancelled.

If `STRIPE_SECRET_KEY` is missing, short boosts and plans show **Payments coming soon** and save a quote request. They do not activate. Existing multi-day packages and Promoter Pro still use their previous test-mode path.

Monthly plans also need price ids. Without them, the plan buttons save a quote and do not charge.

### Environment variables

| Name | Required for |
|---|---|
| `STRIPE_SECRET_KEY` | Any card charge |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature check. Point Stripe at `/api/webhooks/stripe` |
| `STRIPE_PRICE_EVENING` | Optional. Evening pass price id. Omit to charge $9 with `price_data`. Ignored while Promoter Pro is active, so the 15% discount still applies. |
| `STRIPE_PRICE_DAY_PASS` | Optional. Day pass price id. Same rule as the evening price. |
| `STRIPE_PRICE_LOCAL_PRO` | Local Pro subscription. Required before that plan can charge. |
| `STRIPE_PRICE_GROWTH` | Growth subscription. |
| `STRIPE_PRICE_VENUE_PLUS` | Venue Plus subscription. |
| `CRON_SECRET` | `/api/cron/sponsorships` (already used by other crons) |

Price ids must be AUD and GST-inclusive, with no trial. The webhook stores Stripe’s `amount_total` as the amount on the invoice.

## Cron

`vercel.json` calls `GET /api/cron/sponsorships` at minute 7 and 37 of every hour. It expires boosts whose end time has passed or whose impression cap is spent, drops checkouts still pending after two hours, and applies scheduled downgrades. Running it twice does not double-apply.

## Database

Apply `prisma/sql/20261030_sponsorships.sql`. It only creates tables. It does not alter `Promotion`, `ProPass` or `LocalAd`.

Admin counters are at `/admin/sponsorship`: paying organisers, 90-day repeat purchase, MRR, and campaign gross margin after an estimated card fee.

## Rollback

1. Redeploy the previous release. The new routes and the Short boosts tab disappear with it.
2. Remove the `/api/cron/sponsorships` entry from `vercel.json` if you keep a newer file that still has it.
3. Leave the tables in place if you want the invoices. Dropping them deletes boost history and plan invoices:

```sql
DROP TABLE IF EXISTS "PaymentEvent";
DROP TABLE IF EXISTS "SponsorshipLead";
DROP TABLE IF EXISTS "ConversionEvent";
DROP TABLE IF EXISTS "Impression";
DROP TABLE IF EXISTS "Creative";
DROP TABLE IF EXISTS "SubscriptionCharge";
DROP TABLE IF EXISTS "Campaign";
DROP TABLE IF EXISTS "OrganiserSubscription";
DROP TABLE IF EXISTS "SubscriptionPlan";
DROP TABLE IF EXISTS "PlacementInventory";
```

Do not drop them while a Stripe subscription is still renewing. Cancel those subscriptions in Stripe first, or the webhook will 500 on the missing tables and Stripe will retry.
