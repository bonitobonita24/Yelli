// Non-tRPC Route Handler: LiveKit signs webhook bodies with a JWT in the
// Authorization header (verified by WebhookReceiver). Mirrors the xendit
// webhook pattern — verify, enqueue, ack 200. All Recording row mutations
// (status transitions, file_size_bytes, duration_seconds) live in the
// livekit-egress-webhook worker so LiveKit's retry SLA is never blocked
// on DB writes.
import { livekitEgressWebhookQueue } from "@yelli/jobs";
import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import { verifyLiveKitWebhook } from "@/lib/livekit/webhook-verify";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Security gate 1: env-empty graceful degradation ───────────────────────
  // Distinguish config gaps (503) from auth failures (401) so monitoring
  // can flag missing credentials separately from attack noise.
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    console.warn(
      "[livekit-webhook] received but LIVEKIT_API_KEY/SECRET is unset — dropping",
    );
    return NextResponse.json(
      { error: "Webhook receiver not configured" },
      { status: 503 },
    );
  }

  // ── Read raw body (WebhookReceiver verifies the JWT against it) ──────────
  const rawBody = await request.text();
  const authHeader = request.headers.get("Authorization");

  // ── Security gate 2: WebhookReceiver verification ────────────────────────
  const event = await verifyLiveKitWebhook(rawBody, authHeader);
  if (!event) {
    const sourceIp =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "unknown";
    console.warn(
      `[livekit-webhook] rejected: invalid signature from ${sourceIp}`,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Filter to Egress events only ─────────────────────────────────────────
  // LiveKit emits room/participant events too — we don't care about those
  // on this endpoint. Ack 200 so LiveKit doesn't retry, just no-op.
  const egressInfo = event.egressInfo;
  if (!egressInfo || !egressInfo.egressId) {
    return NextResponse.json({ received: true, ignored: event.event });
  }

  // ── Compose deterministic jobId for queue-level idempotency ──────────────
  // event.id is LiveKit's unique webhook ID. Fallback to a composite key
  // so retries with the same egress_id + event_type still collapse.
  const eventId =
    event.id && event.id.length > 0
      ? event.id
      : `${event.event}:${egressInfo.egressId}`;

  // Extract file metadata when present (egress_ended carries fileResults).
  const firstFile = egressInfo.fileResults?.[0];
  const fileSizeBytes =
    firstFile && firstFile.size !== undefined
      ? String(firstFile.size)
      : "0";
  const durationSeconds =
    firstFile && firstFile.duration !== undefined
      ? Number(firstFile.duration) / 1_000_000_000 // LiveKit returns ns
      : 0;

  try {
    await livekitEgressWebhookQueue.add(
      `livekit-egress:${eventId}`,
      {
        event_id: eventId,
        event_type: event.event,
        egress_id: egressInfo.egressId,
        room_name: egressInfo.roomName ?? "",
        status: String(egressInfo.status ?? ""),
        file_size_bytes: fileSizeBytes,
        duration_seconds: Math.round(durationSeconds),
        error_message: egressInfo.error ?? null,
        received_at: new Date().toISOString(),
      },
      {
        jobId: `livekit-egress-${eventId}`,
      },
    );
  } catch (err) {
    console.error("[livekit-webhook] enqueue failed:", err);
    return NextResponse.json(
      { error: "Internal processing error" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
