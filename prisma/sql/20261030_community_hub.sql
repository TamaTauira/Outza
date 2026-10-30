-- Community hub. Additive only: new nullable Event columns and new tables.
-- Existing ingested rows stay public (approvalState and communityKey remain null).
-- Apply before deploying the app version that reads these columns.
-- Rollback: docs/community-hub.md

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "communityKey" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "submissionState" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "approvalState" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "locationVisibility" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "childrenInImage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "imageKidSafe" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "templateKey" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "communityFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "submitIpHash" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "manageTokenHash" TEXT;

CREATE INDEX IF NOT EXISTS "Event_communityKey_approvalState_date_idx" ON "Event"("communityKey", "approvalState", "date");
CREATE INDEX IF NOT EXISTS "Event_approvalState_deletedAt_idx" ON "Event"("approvalState", "deletedAt");
CREATE INDEX IF NOT EXISTS "Event_contactEmail_idx" ON "Event"("contactEmail");
CREATE UNIQUE INDEX IF NOT EXISTS "Event_manageTokenHash_key" ON "Event"("manageTokenHash");

CREATE TABLE IF NOT EXISTS "CommunityAudit" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommunityAudit_eventId_createdAt_idx" ON "CommunityAudit"("eventId", "createdAt");
CREATE INDEX IF NOT EXISTS "CommunityAudit_action_createdAt_idx" ON "CommunityAudit"("action", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CommunityAudit"
    ADD CONSTRAINT "CommunityAudit_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CommunityCode" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommunityCode_tokenHash_key" ON "CommunityCode"("tokenHash");
CREATE INDEX IF NOT EXISTS "CommunityCode_email_createdAt_idx" ON "CommunityCode"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "CommunityCode_eventId_idx" ON "CommunityCode"("eventId");

CREATE TABLE IF NOT EXISTS "CommunityMetric" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "city" TEXT,
  "suburb" TEXT,
  "category" TEXT,
  "path" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityMetric_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommunityMetric_kind_createdAt_idx" ON "CommunityMetric"("kind", "createdAt");
CREATE INDEX IF NOT EXISTS "CommunityMetric_city_suburb_category_idx" ON "CommunityMetric"("city", "suburb", "category");

CREATE TABLE IF NOT EXISTS "CommunityTemplate" (
  "id" TEXT NOT NULL,
  "ownerEmail" TEXT NOT NULL,
  "userId" TEXT,
  "title" TEXT NOT NULL,
  "communityKey" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "suburb" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT,
  "recurrence" TEXT NOT NULL DEFAULT 'NONE',
  "locationVisibility" TEXT NOT NULL DEFAULT 'SUBURB',
  "organiserName" TEXT,
  "websiteUrl" TEXT,
  "isFree" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommunityTemplate_ownerEmail_idx" ON "CommunityTemplate"("ownerEmail");
