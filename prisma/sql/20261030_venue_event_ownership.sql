-- Venue claiming and per-field organiser overrides.
-- Additive only: new columns and new tables. Existing rows are unchanged.
-- Apply this file before deploying the app version that reads these columns.
-- Rollback: docs/venue-event-permissions.md

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "materialConflict" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "sourceEditUrl" TEXT;

ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "officialDomain" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "instagram" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "facebook" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "facilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "accessibilityInfo" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "announcement" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "claimStatus" TEXT NOT NULL DEFAULT 'UNCLAIMED';

CREATE INDEX IF NOT EXISTS "Venue_claimStatus_idx" ON "Venue"("claimStatus");

CREATE TABLE IF NOT EXISTS "Organisation" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "organisationType" TEXT NOT NULL,
  "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "emailDomain" TEXT,
  "website" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Organisation_verificationStatus_idx" ON "Organisation"("verificationStatus");
CREATE INDEX IF NOT EXISTS "Organisation_emailDomain_idx" ON "Organisation"("emailDomain");

CREATE TABLE IF NOT EXISTS "OrganisationMembership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "OrganisationMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrganisationMembership_userId_organisationId_key" ON "OrganisationMembership"("userId", "organisationId");
CREATE INDEX IF NOT EXISTS "OrganisationMembership_organisationId_status_idx" ON "OrganisationMembership"("organisationId", "status");

CREATE TABLE IF NOT EXISTS "VenueManagementGrant" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "permissionScope" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "approvedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "VenueManagementGrant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VenueManagementGrant_venueId_status_idx" ON "VenueManagementGrant"("venueId", "status");
CREATE INDEX IF NOT EXISTS "VenueManagementGrant_organisationId_status_idx" ON "VenueManagementGrant"("organisationId", "status");

CREATE TABLE IF NOT EXISTS "VenueClaimRequest" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "claimantUserId" TEXT NOT NULL,
  "claimantOrganisationId" TEXT,
  "fullName" TEXT NOT NULL,
  "roleAtVenue" TEXT,
  "businessEmail" TEXT NOT NULL,
  "verificationMethod" TEXT NOT NULL,
  "evidenceReference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "riskNote" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "VenueClaimRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VenueClaimRequest_venueId_status_idx" ON "VenueClaimRequest"("venueId", "status");
CREATE INDEX IF NOT EXISTS "VenueClaimRequest_claimantUserId_submittedAt_idx" ON "VenueClaimRequest"("claimantUserId", "submittedAt");
CREATE INDEX IF NOT EXISTS "VenueClaimRequest_status_submittedAt_idx" ON "VenueClaimRequest"("status", "submittedAt");

CREATE TABLE IF NOT EXISTS "EmailVerificationCode" (
  "id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationCode_tokenHash_key" ON "EmailVerificationCode"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmailVerificationCode_purpose_subjectId_idx" ON "EmailVerificationCode"("purpose", "subjectId");
CREATE INDEX IF NOT EXISTS "EmailVerificationCode_email_createdAt_idx" ON "EmailVerificationCode"("email", "createdAt");

CREATE TABLE IF NOT EXISTS "VenueAuditLog" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "previousValue" TEXT,
  "updatedValue" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VenueAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VenueAuditLog_venueId_createdAt_idx" ON "VenueAuditLog"("venueId", "createdAt");

CREATE TABLE IF NOT EXISTS "VenueAnalyticsAggregate" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "metricType" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "VenueAnalyticsAggregate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VenueAnalyticsAggregate_venueId_period_metricType_key" ON "VenueAnalyticsAggregate"("venueId", "period", "metricType");

CREATE TABLE IF NOT EXISTS "VenueEventReport" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "reporterUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "caution" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "VenueEventReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VenueEventReport_eventId_status_idx" ON "VenueEventReport"("eventId", "status");
CREATE INDEX IF NOT EXISTS "VenueEventReport_venueId_createdAt_idx" ON "VenueEventReport"("venueId", "createdAt");
CREATE INDEX IF NOT EXISTS "VenueEventReport_reporterUserId_createdAt_idx" ON "VenueEventReport"("reporterUserId", "createdAt");

CREATE TABLE IF NOT EXISTS "VenueProfileChange" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "fieldName" TEXT NOT NULL,
  "proposedValue" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "VenueProfileChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VenueProfileChange_venueId_status_idx" ON "VenueProfileChange"("venueId", "status");

CREATE TABLE IF NOT EXISTS "VenuePlacement" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "days" INTEGER NOT NULL,
  "orderId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'aud',
  "stripeSessionId" TEXT,
  "paymentMode" TEXT NOT NULL DEFAULT 'stripe',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VenuePlacement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VenuePlacement_stripeSessionId_key" ON "VenuePlacement"("stripeSessionId");
CREATE INDEX IF NOT EXISTS "VenuePlacement_venueId_status_idx" ON "VenuePlacement"("venueId", "status");
CREATE INDEX IF NOT EXISTS "VenuePlacement_orderId_idx" ON "VenuePlacement"("orderId");

CREATE TABLE IF NOT EXISTS "EventManagementGrant" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'APPROVED',
  "approvedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "EventManagementGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EventManagementGrant_eventId_organisationId_key" ON "EventManagementGrant"("eventId", "organisationId");
CREATE INDEX IF NOT EXISTS "EventManagementGrant_organisationId_status_idx" ON "EventManagementGrant"("organisationId", "status");

CREATE TABLE IF NOT EXISTS "EventFieldOverride" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "fieldName" TEXT NOT NULL,
  "overrideValue" TEXT NOT NULL,
  "originalSourceValue" TEXT,
  "updatedBy" TEXT NOT NULL,
  "authorisedOrganisationId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verificationContext" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "EventFieldOverride_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EventFieldOverride_eventId_fieldName_key" ON "EventFieldOverride"("eventId", "fieldName");
CREATE INDEX IF NOT EXISTS "EventFieldOverride_eventId_active_idx" ON "EventFieldOverride"("eventId", "active");

CREATE TABLE IF NOT EXISTS "EventOverrideHistory" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "fieldName" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousValue" TEXT,
  "updatedValue" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventOverrideHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EventOverrideHistory_eventId_createdAt_idx" ON "EventOverrideHistory"("eventId", "createdAt");

CREATE TABLE IF NOT EXISTS "EventEditAck" (
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventEditAck_pkey" PRIMARY KEY ("userId", "eventId")
);

CREATE TABLE IF NOT EXISTS "SecurityAudit" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SecurityAudit_targetType_targetId_idx" ON "SecurityAudit"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "SecurityAudit_createdAt_idx" ON "SecurityAudit"("createdAt");

DO $$ BEGIN
  ALTER TABLE "OrganisationMembership" ADD CONSTRAINT "OrganisationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "OrganisationMembership" ADD CONSTRAINT "OrganisationMembership_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenueManagementGrant" ADD CONSTRAINT "VenueManagementGrant_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenueManagementGrant" ADD CONSTRAINT "VenueManagementGrant_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenueClaimRequest" ADD CONSTRAINT "VenueClaimRequest_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenueClaimRequest" ADD CONSTRAINT "VenueClaimRequest_claimantUserId_fkey" FOREIGN KEY ("claimantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenueClaimRequest" ADD CONSTRAINT "VenueClaimRequest_claimantOrganisationId_fkey" FOREIGN KEY ("claimantOrganisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenueAuditLog" ADD CONSTRAINT "VenueAuditLog_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenueAnalyticsAggregate" ADD CONSTRAINT "VenueAnalyticsAggregate_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenueEventReport" ADD CONSTRAINT "VenueEventReport_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenueEventReport" ADD CONSTRAINT "VenueEventReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenueEventReport" ADD CONSTRAINT "VenueEventReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenueProfileChange" ADD CONSTRAINT "VenueProfileChange_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenuePlacement" ADD CONSTRAINT "VenuePlacement_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenuePlacement" ADD CONSTRAINT "VenuePlacement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EventManagementGrant" ADD CONSTRAINT "EventManagementGrant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EventManagementGrant" ADD CONSTRAINT "EventManagementGrant_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EventFieldOverride" ADD CONSTRAINT "EventFieldOverride_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EventOverrideHistory" ADD CONSTRAINT "EventOverrideHistory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EventEditAck" ADD CONSTRAINT "EventEditAck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EventEditAck" ADD CONSTRAINT "EventEditAck_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
