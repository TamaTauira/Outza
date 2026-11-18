-- Additive. Existing accounts stay opted in, which is how the newsletter already behaves.
-- No country was stored for them, so they are not reclassified here.
-- After that, the default for new rows is off. Password signup sets Australia on
-- from the x-vercel-ip-country header. EU, EEA, UK, unknown, and Google signups
-- stay off until the person turns it on in account settings.
-- Do not apply until a Neon snapshot is taken. Apply before the code that reads this column is deployed.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailActivityPersonalisation" BOOLEAN;
UPDATE "User" SET "emailActivityPersonalisation" = true WHERE "emailActivityPersonalisation" IS NULL;
ALTER TABLE "User" ALTER COLUMN "emailActivityPersonalisation" SET DEFAULT false;
ALTER TABLE "User" ALTER COLUMN "emailActivityPersonalisation" SET NOT NULL;
