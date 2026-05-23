// NOTE: server-only — do not import in client components
// (server-only package not installed; enforce via code review and naming convention)
import { createHmac } from "crypto";

import { env } from "@/env";

interface MintOptions {
  identity: string;
  displayName: string;
  roomName: string;
  canPublish?: boolean;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Pick the LiveKit WebSocket URL the BROWSER should connect to.
 * Prefer NEXT_PUBLIC_LIVEKIT_URL (host-reachable in containerized dev,
 * public-domain WSS in staging/prod). Fall back to the server-side
 * LIVEKIT_URL only when no client-facing override is configured —
 * correct when host and browser share the same network (e.g. host
 * pnpm dev where ws://localhost:7880 resolves at both ends).
 *
 * See lessons.md [[livekit-url-host-reachability]].
 */
export function pickClientLivekitWsUrl(env: {
  NEXT_PUBLIC_LIVEKIT_URL: string | undefined;
  LIVEKIT_URL: string | undefined;
}): string | undefined {
  if (env.NEXT_PUBLIC_LIVEKIT_URL) return env.NEXT_PUBLIC_LIVEKIT_URL;
  if (env.LIVEKIT_URL) return env.LIVEKIT_URL;
  return undefined;
}

export function mintLiveKitToken(options: MintOptions): {
  token: string;
  wsUrl: string;
} {
  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  // Browser-facing URL — NOT the server-side env.LIVEKIT_URL because that
  // points at the docker-internal hostname in containerized dev.
  const wsUrl = pickClientLivekitWsUrl({
    NEXT_PUBLIC_LIVEKIT_URL: env.NEXT_PUBLIC_LIVEKIT_URL,
    LIVEKIT_URL: env.LIVEKIT_URL,
  });

  if (!apiKey || !apiSecret || !wsUrl) {
    throw new Error("LiveKit not configured");
  }

  const { identity, displayName, roomName, canPublish = true } = options;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 6 * 60 * 60; // 6 hours

  const header = { alg: "HS256", typ: "JWT" };
  const grant = {
    room: roomName,
    roomJoin: true,
    canPublish,
    canSubscribe: true,
    canPublishData: true,
  };
  const payload = {
    iss: apiKey,
    sub: identity,
    name: displayName,
    video: grant,
    nbf: now,
    exp,
    jti: `${identity}-${now}`,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", apiSecret)
    .update(signingInput)
    .digest();
  const encodedSignature = base64url(signature);

  return {
    token: `${signingInput}.${encodedSignature}`,
    wsUrl,
  };
}
