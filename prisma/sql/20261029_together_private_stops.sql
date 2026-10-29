-- Private Together stops. These rows are not Event listings.
-- eventId becomes optional. Existing public shortlist rows are unchanged.

ALTER TABLE "TogetherItem" ALTER COLUMN "eventId" DROP NOT NULL;
ALTER TABLE "TogetherItem" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "TogetherItem" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "TogetherItem" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "TogetherItem" ADD COLUMN IF NOT EXISTS "startTime" TEXT;
ALTER TABLE "TogetherItem" ADD COLUMN IF NOT EXISTS "endTime" TEXT;
ALTER TABLE "TogetherItem" ADD COLUMN IF NOT EXISTS "stopDate" TIMESTAMP(3);
ALTER TABLE "TogetherItem" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "TogetherItem" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "TogetherItem" ADD COLUMN IF NOT EXISTS "addedById" TEXT;
ALTER TABLE "TogetherItem" ADD COLUMN IF NOT EXISTS "addedByGuest" TEXT;
CREATE INDEX IF NOT EXISTS "TogetherItem_addedById_idx" ON "TogetherItem"("addedById");
