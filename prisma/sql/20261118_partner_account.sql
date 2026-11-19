-- Source partner logins. Additive. Applied by hand after snapshot pre-source-partner-20261118.
-- Does not alter Event rows or JobWatermark.

CREATE TABLE IF NOT EXISTS "PartnerAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerAccount_userId_key" ON "PartnerAccount"("userId");

DO $$ BEGIN
  ALTER TABLE "PartnerAccount"
    ADD CONSTRAINT "PartnerAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PartnerSource" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "hostPatterns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerSource_partnerId_sourceKey_key" ON "PartnerSource"("partnerId", "sourceKey");
CREATE INDEX IF NOT EXISTS "PartnerSource_sourceKey_idx" ON "PartnerSource"("sourceKey");

DO $$ BEGIN
  ALTER TABLE "PartnerSource"
    ADD CONSTRAINT "PartnerSource_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "PartnerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Event_source_idx" ON "Event"("source");
CREATE INDEX IF NOT EXISTS "SourceRecord_source_idx" ON "SourceRecord"("source");
