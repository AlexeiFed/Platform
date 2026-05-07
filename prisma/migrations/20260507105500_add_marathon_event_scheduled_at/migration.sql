-- Add scheduledAt for LIVE events (and optional for others).
ALTER TABLE "marathon_events"
ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);

-- Index for admin live list filtering/sorting.
CREATE INDEX IF NOT EXISTS "marathon_events_productId_scheduledAt_idx"
ON "marathon_events" ("productId", "scheduledAt");

