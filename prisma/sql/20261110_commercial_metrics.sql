-- Commercial metrics: anonymous audience days, search-to-event, marketing spend,
-- and a Resend id on each edition. Additive only.
--   psql "$DATABASE_URL" -f prisma/sql/20261110_commercial_metrics.sql

CREATE TABLE IF NOT EXISTS "AudienceDay" (
  "visitorId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AudienceDay_pkey" PRIMARY KEY ("visitorId", "day")
);

CREATE INDEX IF NOT EXISTS "AudienceDay_day_idx" ON "AudienceDay" ("day");

CREATE TABLE IF NOT EXISTS "DiscoverySearch" (
  "visitorId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "queryKey" TEXT NOT NULL,
  "clicked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscoverySearch_pkey" PRIMARY KEY ("visitorId", "day", "queryKey")
);

CREATE INDEX IF NOT EXISTS "DiscoverySearch_day_idx" ON "DiscoverySearch" ("day");
CREATE INDEX IF NOT EXISTS "DiscoverySearch_visitorId_day_createdAt_idx" ON "DiscoverySearch" ("visitorId", "day", "createdAt");

CREATE TABLE IF NOT EXISTS "MetricEpoch" (
  "key" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetricEpoch_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "MarketingSpend" (
  "month" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "note" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingSpend_pkey" PRIMARY KEY ("month")
);

CREATE TABLE IF NOT EXISTS "EmailWebhookEvent" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailWebhookEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NewsletterSend" ADD COLUMN IF NOT EXISTS "resendId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSend_resendId_key" ON "NewsletterSend" ("resendId");
