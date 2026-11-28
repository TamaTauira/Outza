-- Reactions on VibePeep Local listings. EventReaction is keyed to Event rows
-- and a Local listing is a LocalListing row, so listing reactions need their
-- own table with the same shape: one row per person, listing and kind.
-- Additive only. Safe to re-run.

CREATE TABLE IF NOT EXISTS "LocalReaction" (
  "userId" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LocalReaction_pkey" PRIMARY KEY ("userId", "listingId", "kind")
);

CREATE INDEX IF NOT EXISTS "LocalReaction_listingId_kind_idx" ON "LocalReaction" ("listingId", "kind");
CREATE INDEX IF NOT EXISTS "LocalReaction_userId_updatedAt_idx" ON "LocalReaction" ("userId", "updatedAt");

DO $$ BEGIN
  ALTER TABLE "LocalReaction" ADD CONSTRAINT "LocalReaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "LocalReaction" ADD CONSTRAINT "LocalReaction_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "LocalListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
