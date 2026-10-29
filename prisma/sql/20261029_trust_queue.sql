-- Quality flags can wait for an admin decision. Older rows stay null (log only) so they do not fill the badge.
ALTER TABLE "QualityAudit" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "QualityAudit" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "QualityAudit_status_action_idx" ON "QualityAudit"("status", "action");
