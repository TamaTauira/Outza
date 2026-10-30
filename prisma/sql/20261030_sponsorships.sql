-- Additive sponsorship tables. Safe to run more than once.
-- Does not alter Promotion, ProPass, or LocalAd.

CREATE TABLE IF NOT EXISTS "PlacementInventory" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "placement" TEXT NOT NULL,
  "durationKind" TEXT NOT NULL,
  "minMinutes" INTEGER NOT NULL,
  "maxMinutes" INTEGER NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "impressionCap" INTEGER NOT NULL,
  "guaranteed" TEXT NOT NULL,
  "estimated" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS "SubscriptionPlan" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "monthlyCents" INTEGER NOT NULL,
  "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS "OrganiserSubscription" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "planId" TEXT NOT NULL REFERENCES "SubscriptionPlan"("id"),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT FALSE,
  "pendingPlanId" TEXT,
  "pendingPlanAt" TIMESTAMP(3),
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'aud',
  "paymentMode" TEXT NOT NULL DEFAULT 'stripe',
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripeSessionId" TEXT,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "consentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganiserSubscription_stripeSubscriptionId_key" ON "OrganiserSubscription" ("stripeSubscriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "OrganiserSubscription_stripeSessionId_key" ON "OrganiserSubscription" ("stripeSessionId");
CREATE INDEX IF NOT EXISTS "OrganiserSubscription_userId_status_idx" ON "OrganiserSubscription" ("userId", "status");

CREATE TABLE IF NOT EXISTS "SubscriptionCharge" (
  "id" TEXT PRIMARY KEY,
  "subscriptionId" TEXT NOT NULL REFERENCES "OrganiserSubscription"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'aud',
  "status" TEXT NOT NULL DEFAULT 'PAID',
  "stripePaymentIntentId" TEXT,
  "hostedUrl" TEXT,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SubscriptionCharge_userId_createdAt_idx" ON "SubscriptionCharge" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SubscriptionCharge_subscriptionId_idx" ON "SubscriptionCharge" ("subscriptionId");

CREATE TABLE IF NOT EXISTS "Campaign" (
  "id" TEXT PRIMARY KEY,
  "promoterId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "eventId" TEXT NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
  "inventoryId" TEXT NOT NULL REFERENCES "PlacementInventory"("id"),
  "city" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "impressionCap" INTEGER NOT NULL,
  "spendCapCents" INTEGER NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'aud',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paymentMode" TEXT NOT NULL DEFAULT 'stripe',
  "stripeSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "consentAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Campaign_stripeSessionId_key" ON "Campaign" ("stripeSessionId");
CREATE INDEX IF NOT EXISTS "Campaign_status_endsAt_idx" ON "Campaign" ("status", "endsAt");
CREATE INDEX IF NOT EXISTS "Campaign_promoterId_status_idx" ON "Campaign" ("promoterId", "status");
CREATE INDEX IF NOT EXISTS "Campaign_eventId_idx" ON "Campaign" ("eventId");
CREATE INDEX IF NOT EXISTS "Campaign_city_status_startsAt_idx" ON "Campaign" ("city", "status", "startsAt");

CREATE TABLE IF NOT EXISTS "Creative" (
  "id" TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "headline" TEXT NOT NULL,
  "blurb" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "Creative_campaignId_key" ON "Creative" ("campaignId");

CREATE TABLE IF NOT EXISTS "Impression" (
  "id" TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "surface" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS "Impression_campaignId_surface_bucket_key" ON "Impression" ("campaignId", "surface", "bucket");
CREATE INDEX IF NOT EXISTS "Impression_campaignId_idx" ON "Impression" ("campaignId");

CREATE TABLE IF NOT EXISTS "ConversionEvent" (
  "id" TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "actorHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ConversionEvent_campaignId_kind_idx" ON "ConversionEvent" ("campaignId", "kind");
CREATE INDEX IF NOT EXISTS "ConversionEvent_actorHash_kind_createdAt_idx" ON "ConversionEvent" ("actorHash", "kind", "createdAt");

CREATE TABLE IF NOT EXISTS "SponsorshipLead" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "email" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "note" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SponsorshipLead_email_kind_createdAt_idx" ON "SponsorshipLead" ("email", "kind", "createdAt");

CREATE TABLE IF NOT EXISTS "PaymentEvent" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "PlacementInventory" ("id", "name", "placement", "durationKind", "minMinutes", "maxMinutes", "priceCents", "impressionCap", "guaranteed", "estimated")
VALUES
  (
    'EVENING',
    'Evening pass',
    'FEATURED',
    'EVENING',
    60,
    360,
    900,
    2500,
    'A Sponsored card in your city’s Hot right now band, from the start you pick until the end or the impression cap, whichever comes first. Sponsored cards stay a minority whenever other events match.',
    'Up to 2,500 serves. Detail views and Get tickets clicks are not promised. Ticket sales happen on your own site and are not visible here.'
  ),
  (
    'DAY_PASS',
    'Day pass',
    'FEATURED',
    'DAY',
    60,
    1440,
    1500,
    8000,
    'A Sponsored card in your city’s Hot right now band for the window you pick, until the end or the impression cap, whichever comes first. Sponsored cards stay a minority whenever other events match.',
    'Up to 8,000 serves. Detail views and Get tickets clicks are not promised. Ticket sales happen on your own site and are not visible here.'
  )
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "SubscriptionPlan" ("id", "name", "monthlyCents", "features")
VALUES
  (
    'LOCAL_PRO',
    'Local Pro',
    3900,
    ARRAY[
      'Five short boosts at once',
      'Invoices for every renewal',
      'Change or cancel the plan yourself'
    ]::TEXT[]
  ),
  (
    'GROWTH',
    'Growth',
    9900,
    ARRAY[
      'Fifteen short boosts at once',
      'Schedule a boost up to 60 days ahead',
      'Hourly results and a CSV export'
    ]::TEXT[]
  ),
  (
    'VENUE_PLUS',
    'Venue Plus',
    19900,
    ARRAY[
      'Forty short boosts at once',
      'Pause every live boost',
      '7-day refund window when a boost has not been shown'
    ]::TEXT[]
  )
ON CONFLICT ("id") DO NOTHING;
