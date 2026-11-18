-- Additive record of which legal version an account holder accepted.
-- Does not write a row for existing people. They accept on the next sign-in or checkout.
-- Do not apply until a Neon snapshot is taken.
CREATE TABLE IF NOT EXISTS "TermsAcceptance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "doc" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TermsAcceptance_userId_doc_version_idx" ON "TermsAcceptance"("userId", "doc", "version");

DO $$ BEGIN
  ALTER TABLE "TermsAcceptance"
    ADD CONSTRAINT "TermsAcceptance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
