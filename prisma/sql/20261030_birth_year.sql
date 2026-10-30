-- Store a birth year only. Existing dates become that year, then the full date is dropped.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthYear" INTEGER;
UPDATE "User"
SET "birthYear" = EXTRACT(YEAR FROM "birthDate")::int
WHERE "birthDate" IS NOT NULL AND "birthYear" IS NULL;
ALTER TABLE "User" DROP COLUMN IF EXISTS "birthDate";
