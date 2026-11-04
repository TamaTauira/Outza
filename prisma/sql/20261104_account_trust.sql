-- Password reset, email verification, and the one-month subscription trial.
-- Apply once, with the deploy. It does not delete rows.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "trialUsedAt" TIMESTAMP(3);

-- Accounts opened before verification existed, including the QA logins, stay verified.
-- Signups after this statement leave emailVerified empty until the link is opened.
UPDATE "User" SET "emailVerified" = NOW() WHERE "emailVerified" IS NULL;

CREATE TABLE IF NOT EXISTS "AuthToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "AuthToken_userId_purpose_createdAt_idx" ON "AuthToken"("userId", "purpose", "createdAt");
ALTER TABLE "AuthToken" DROP CONSTRAINT IF EXISTS "AuthToken_userId_fkey";
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganiserSubscription" ADD COLUMN IF NOT EXISTS "trialRemindedAt" TIMESTAMP(3);
