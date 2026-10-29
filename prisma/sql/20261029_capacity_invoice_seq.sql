-- Optional organiser-supplied capacity. Null means not stated.
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "capacity" INTEGER;

-- Sequential tax-invoice numbers. The same purchase id always keeps the same number.
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1001;
CREATE TABLE IF NOT EXISTS "InvoiceSeq" (
  "id" TEXT PRIMARY KEY,
  "number" INTEGER NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Board reads filter by city and date, then status. This covers that path.
CREATE INDEX IF NOT EXISTS "Event_city_date_status_idx" ON "Event" ("city", "date", "status");
CREATE INDEX IF NOT EXISTS "Promotion_eventId_status_endsAt_idx" ON "Promotion" ("eventId", "status", "endsAt");
