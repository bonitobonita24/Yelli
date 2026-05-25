-- Add egress_id to recordings: correlates LiveKit Egress webhook events
-- to the originating Recording row. Nullable for back-compat with rows
-- inserted before Egress wiring (legacy seed data, manual recordings).
-- @unique guarantees one Egress lifetime ↔ one Recording.
ALTER TABLE "recordings" ADD COLUMN "egress_id" TEXT;

CREATE UNIQUE INDEX "recordings_egress_id_key" ON "recordings"("egress_id");

-- file_size_bytes and duration_seconds default to 0 so the Recording row
-- can be inserted at egress-start time (before the file exists). The
-- webhook worker overwrites both when Egress emits egress_ended.
ALTER TABLE "recordings" ALTER COLUMN "file_size_bytes" SET DEFAULT 0;
ALTER TABLE "recordings" ALTER COLUMN "duration_seconds" SET DEFAULT 0;
