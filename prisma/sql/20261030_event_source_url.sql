-- Original listing page, kept even when it is not a ticket checkout.
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
