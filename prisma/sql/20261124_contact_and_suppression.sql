-- Empty tables only. No existing rows are updated.
-- Apply before contact storage and bounce suppression are read in production.
-- The contact form still emails the owner if this table is missing.

CREATE TABLE IF NOT EXISTS "ContactMessage" (
  "id" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "category" TEXT,
  "urgency" TEXT,
  "aiSummary" TEXT,
  "draftReply" TEXT,
  "sentReplyTemplate" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContactMessage_status_createdAt_idx" ON "ContactMessage"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ContactMessage_email_idx" ON "ContactMessage"("email");

CREATE TABLE IF NOT EXISTS "EmailSuppression" (
  "email" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("email")
);
