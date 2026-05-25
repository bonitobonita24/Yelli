-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "event_id" TEXT NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX "processed_webhook_events_provider_processed_at_idx" ON "processed_webhook_events"("provider", "processed_at");
