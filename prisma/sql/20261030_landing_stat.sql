-- Guide conversion counters. Additive. Safe to leave in place if the app change is rolled back.
CREATE TABLE IF NOT EXISTS "LandingStat" (
  "id" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "views" INTEGER NOT NULL DEFAULT 0,
  "detailViews" INTEGER NOT NULL DEFAULT 0,
  "saves" INTEGER NOT NULL DEFAULT 0,
  "leads" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LandingStat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LandingStat_path_source_key" ON "LandingStat"("path", "source");
CREATE INDEX IF NOT EXISTS "LandingStat_source_idx" ON "LandingStat"("source");
