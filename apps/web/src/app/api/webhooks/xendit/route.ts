// Non-tRPC Route Handler: x-callback-token IS the auth (security.md §4 — Xendit
// cannot provide JWT). Phase 8 Item 3b-i — handler verifies signature, enqueues
// to BullMQ for asynchronous processing, and acks 200 fast. All business logic
// (Subscription / Invoice mutation, idempotency, AuditLog) lives in the worker
// 3b-ii so Xendit's retry SLA (≤30s) is never blocked on DB writes.

import { xenditWebhookQueue } from "@yelli/jobs";
import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import { verifyXenditCallbackToken } from "@/server/lib/xendit/webhook-verify";

export const runtime = "nodejs";

/**
 * Minimal envelope shape the route needs for queue routing. The worker
 * (3b-ii) re-validates the full payload with Zod before any side-effect —
 * an over-permissive route shape here CANNOT escalate into bad DB state.
 */
interface MinimalXenditPayload {
  id?: unknown;
  event?: unknown;
  status?: unknown;
  external_id?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Security gate 1: env-empty graceful degradation ───────────────────────
  // Parallels billing.checkout.createSession SERVICE_UNAVAILABLE pattern.
  // Returns 503 (not 401) so Xendit's monitoring distinguishes config gaps
  // from genuine signature failures. Logged for ops to act on.
  if (!env.XENDIT_WEBHOOK_TOKEN) {
    console.warn(
      "[xendit-webhook] received but XENDIT_WEBHOOK_TOKEN is unset — dropping",
    );
    return NextResponse.json(
      { error: "Webhook receiver not configured" },
      { status: 503 },
    );
  }

  // ── Security gate 2: x-callback-token verification ───────────────────────
  // security.md rule 1: constant-time compare via verifyXenditCallbackToken.
  const receivedToken = request.headers.get("x-callback-token");
  if (!verifyXenditCallbackToken(receivedToken, env.XENDIT_WEBHOOK_TOKEN)) {
    // Never log the attempted token value — only its presence + source IP.
    const sourceIp =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "unknown";
    console.warn(
      `[xendit-webhook] rejected: invalid x-callback-token from ${sourceIp}`,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse payload (minimal shape only) ───────────────────────────────────
  let body: MinimalXenditPayload;
  try {
    body = (await request.json()) as MinimalXenditPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // event_id is required for jobId-level idempotency on the queue.
  if (typeof body.id !== "string" || body.id.length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid event id" },
      { status: 400 },
    );
  }

  const eventType =
    typeof body.event === "string"
      ? body.event
      : typeof body.status === "string"
        ? body.status
        : "unknown";
  const externalId =
    typeof body.external_id === "string" ? body.external_id : "";

  // ── Enqueue for asynchronous processing ──────────────────────────────────
  // BullMQ-level idempotency: jobId guarantees that if Xendit retries
  // (network blip, our 5xx, etc.) the second add() is a no-op even before
  // the worker checks the ProcessedWebhookEvent table (3b-ii). Defense in
  // depth — both layers are required, neither is sufficient.
  try {
    await xenditWebhookQueue.add(
      `xendit-webhook:${body.id}`,
      {
        event_id: body.id,
        event_type: eventType,
        external_id: externalId,
        payload: body as unknown as Record<string, unknown>,
        received_at: new Date().toISOString(),
      },
      {
        jobId: `xendit-event-${body.id}`,
      },
    );
  } catch (err) {
    // 500 → Xendit retries per their backoff (up to 6 attempts). Never
    // ack-then-fail; that would silently drop a payment notification.
    console.error("[xendit-webhook] enqueue failed:", err);
    return NextResponse.json(
      { error: "Internal processing error" },
      { status: 500 },
    );
  }

  // 200 ack — Xendit cancels retries on 2xx. Worker owns delivery from here.
  return NextResponse.json({ received: true });
}
