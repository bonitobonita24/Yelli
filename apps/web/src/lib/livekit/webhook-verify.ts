// NOTE: server-only — do not import in client components.
// Wraps livekit-server-sdk's WebhookReceiver. LiveKit signs every webhook
// payload with a JWT in the Authorization header, validated against the
// project API secret. This is the LiveKit equivalent of Xendit's
// x-callback-token check (see lib/xendit/webhook-verify.ts).
import { WebhookReceiver, type WebhookEvent } from "livekit-server-sdk";

import { env } from "@/env";

/**
 * Verify a LiveKit webhook request and return the parsed event.
 *
 * Returns null on auth failure (missing header, invalid signature, replay,
 * etc.) — callers MUST treat null as 401 Unauthorized. NEVER fall back to
 * processing the body on a null return.
 *
 * Throws ONLY when the server is misconfigured (missing API key/secret).
 * That is a 5xx-style failure — distinguishable from auth failure by the
 * caller so monitoring can flag config gaps separately from attack noise.
 */
export async function verifyLiveKitWebhook(
  rawBody: string,
  authHeader: string | null | undefined,
): Promise<WebhookEvent | null> {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = env;
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error(
      "LiveKit webhook not configured: LIVEKIT_API_KEY / LIVEKIT_API_SECRET required",
    );
  }

  if (!authHeader) return null;

  const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  try {
    return await receiver.receive(rawBody, authHeader);
  } catch {
    // Never log the auth header value — it contains the JWT. Caller logs
    // source IP + rejection so ops can spot brute-force probes.
    return null;
  }
}
